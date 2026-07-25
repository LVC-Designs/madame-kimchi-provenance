// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title  Madame Kimchi — Batch Provenance Protocol
/// @notice Append-only registry binding a physical kimchi batch to the public
///         metadata and chain-of-custody attestations published about it.
///
/// @dev    What this contract establishes:
///
///         An authorized verifier registered these exact bytes at this time,
///         and they have not changed since.
///
///         What it does NOT establish: that the contents are true, that the
///         product is safe, that any certification is valid, or that a physical
///         jar matches the record. Those are claims about the world; this is a
///         claim about bytes.
///
///         Identity rule: the canonical `keccak256` hash of a published
///         document IS its identifier. `recordHash` is the hash of the
///         canonical `BatchMetadata` JSON, and `attestationHash` is the hash of
///         the canonical `AttestationMetadata` JSON. There is no separate
///         "metadata hash" field to drift out of sync with the key.
///
///         Only hashes, an enum, an address, a timestamp, and a short URI are
///         ever stored. Supplier documents, certificates, invoices, test
///         reports, personal data, pricing, and private facility details are
///         out of bounds, on-chain and in logs alike.
///
///         The contract makes no external calls and holds no ether: there is no
///         `receive`, no `fallback`, no `payable` function, no `delegatecall`,
///         and therefore no reentrancy or arbitrary-call surface. There is no
///         token, payment, tax, burn, staking, yield, swap, bridge, or
///         governance logic, by requirement.
///
///         Not upgradeable. A defect requires a fresh deployment; records at
///         the old address remain readable forever.
contract KimchiProvenance is AccessControl, Pausable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Lifecycle state of a batch record.
    /// @dev    Ordering is part of the ABI and must stay in lockstep with the
    ///         `BATCH_STATUSES` tuple in `src/lib/schema.ts`.
    ///
    ///         `RECALLED` and `SUPERSEDED` are terminal. A recall must never be
    ///         quietly withdrawn — that is the entire point of a tamper-evident
    ///         food record — so the remedy for a mistaken recall is a
    ///         `CORRECTION` attestation, which is append-only and leaves the
    ///         recall permanently visible.
    enum BatchStatus {
        ACTIVE,
        QUARANTINED,
        RECALLED,
        SUPERSEDED
    }

    /// @notice Fixed chain-of-custody event vocabulary.
    /// @dev    Ordering is part of the ABI and must stay in lockstep with the
    ///         `ATTESTATION_TYPES` tuple in `src/lib/schema.ts`.
    enum AttestationType {
        INGREDIENT_RECEIVED,
        FERMENTATION_STARTED,
        FERMENTATION_COMPLETED,
        QUALITY_CHECK,
        PACKED,
        SHIPPED,
        DISTRIBUTOR_RECEIVED,
        RETAILER_RECEIVED,
        QUARANTINED,
        RECALLED,
        CORRECTION
    }

    /// @notice A registered batch record.
    /// @dev    The record's own hash is the mapping key and so is not repeated
    ///         here. `registeredAt` doubles as the existence sentinel: it is
    ///         non-zero for every registered record and zero for every absent
    ///         one, which is why zero is rejected for every hash argument.
    /// @param batchIdHash            keccak256 over the NFC-normalized batchId; groups every version of one batch.
    /// @param supersedesRecordHash   Backward link to the record this one replaces; zero for an original.
    /// @param supersededByRecordHash Forward link to the record that replaced this one; zero while current.
    /// @param issuer                 Verifier wallet that registered the record.
    /// @param registeredAt           Block timestamp of registration.
    /// @param status                 Current lifecycle state.
    /// @param metadataURI            Optional public location of the metadata document; may be empty when publication is not authorized.
    struct BatchRecord {
        bytes32 batchIdHash;
        bytes32 supersedesRecordHash;
        bytes32 supersededByRecordHash;
        address issuer;
        uint64 registeredAt;
        BatchStatus status;
        string metadataURI;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice May register batches, append attestations, and change status.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /// @notice May halt and resume all state-changing entry points.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Off-chain metadata schema version this deployment expects.
    /// @dev    Declared on-chain so a future schema cannot be silently mixed
    ///         into a deployment built for the current one.
    uint16 public constant SUPPORTED_SCHEMA_VERSION = 1;

    /// @notice Upper bound on any URI accepted by this contract, in bytes.
    /// @dev    Cheap insurance against an accidental document blob reaching
    ///         calldata or log data.
    uint256 public constant MAX_URI_LENGTH = 2048;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(bytes32 recordHash => BatchRecord) private _batches;

    /// @dev Every version of a batch, in registration order. Supersession
    ///      cannot fork, so the chain is linear and the last element is always
    ///      the current head.
    mapping(bytes32 batchIdHash => bytes32[] recordHashes) private _versions;

    /// @dev Attestation hash to the batch record it belongs to. A non-zero
    ///      value means "recorded", which is all that duplicate rejection
    ///      needs; the timeline itself lives in `AttestationAdded` logs.
    mapping(bytes32 attestationHash => bytes32 batchRecordHash) private _attestationBatch;

    /// @notice Number of attestations appended to a batch record.
    /// @dev    Kept in storage so a passport page can show a count without
    ///         running a log query.
    mapping(bytes32 recordHash => uint32 count) public attestationCount;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice A batch record was registered by an authorized verifier.
    /// @dev    Indexes are spent on the three queries the interface actually
    ///         runs: one record, every version of a batch, everything one
    ///         verifier issued.
    event BatchRegistered(
        bytes32 indexed recordHash,
        bytes32 indexed batchIdHash,
        address indexed issuer,
        bytes32 supersedesRecordHash,
        BatchStatus status,
        string metadataURI,
        uint64 registeredAt
    );

    /// @notice A record was replaced by a newer version. The old record stays
    ///         readable; only its status and forward link change.
    event BatchSuperseded(
        bytes32 indexed supersededRecordHash,
        bytes32 indexed newRecordHash,
        bytes32 indexed batchIdHash,
        uint64 supersededAt
    );

    /// @notice A chain-of-custody attestation was appended. Never removed,
    ///         never modified.
    event AttestationAdded(
        bytes32 indexed batchRecordHash,
        bytes32 indexed attestationHash,
        AttestationType indexed attestationType,
        address verifier,
        string metadataURI,
        uint64 recordedAt
    );

    /// @notice A batch record changed lifecycle state. Emitted for every
    ///         transition including supersession, so log-based reconstruction
    ///         has exactly one event type to follow and no special case.
    /// @dev    For a supersession-driven change `reasonHash` is zero and
    ///         `reasonURI` empty, because `BatchSuperseded` carries the detail.
    event BatchStatusChanged(
        bytes32 indexed recordHash,
        BatchStatus indexed previousStatus,
        BatchStatus indexed newStatus,
        address verifier,
        bytes32 reasonHash,
        string reasonURI,
        uint64 changedAt
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    /// @notice A required hash argument was zero, which is reserved as the "absent" sentinel.
    error ZeroHash();
    /// @notice The admin address was zero.
    error ZeroAddress();
    /// @notice A URI exceeded `MAX_URI_LENGTH`.
    error URITooLong(uint256 length, uint256 maxLength);
    /// @notice This record hash is already registered. Records are never overwritten.
    error BatchAlreadyRegistered(bytes32 recordHash);
    /// @notice No record exists for this hash.
    error BatchNotFound(bytes32 recordHash);
    /// @notice No record has ever been registered under this batch id.
    error UnknownBatchId(bytes32 batchIdHash);
    /// @notice This attestation hash is already recorded.
    error AttestationAlreadyRecorded(bytes32 attestationHash);
    /// @notice The record being superseded does not exist.
    error PredecessorNotFound(bytes32 supersedesRecordHash);
    /// @notice A record cannot supersede itself.
    error SelfSupersede();
    /// @notice The predecessor belongs to a different batch id.
    error PredecessorBatchIdMismatch(bytes32 expected, bytes32 actual);
    /// @notice The predecessor was already superseded. Version chains cannot fork.
    error PredecessorAlreadySuperseded(bytes32 supersedesRecordHash, bytes32 supersededBy);
    /// @notice Recalled and superseded records are terminal and cannot be superseded.
    error CannotSupersedeTerminalRecord(bytes32 supersedesRecordHash, BatchStatus status);
    /// @notice A correction must carry its predecessor's status forward, so a
    ///         quarantine cannot be laundered away by filing a new version.
    error PredecessorStatusMismatch(BatchStatus expected, BatchStatus actual);
    /// @notice A new record may only be registered as ACTIVE or QUARANTINED.
    error InvalidInitialStatus(BatchStatus status);
    /// @notice This lifecycle transition is not permitted.
    error InvalidStatusTransition(BatchStatus from, BatchStatus to);
    /// @notice The record already has this status.
    error StatusUnchanged(BatchStatus status);
    /// @notice Every status change must reference an off-chain justification.
    error MissingReason();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @notice Deploys the registry and seats the initial administrator.
    /// @dev    `admin` is a parameter rather than `msg.sender` so that moving
    ///         administration to a multisig is a deployment argument instead of
    ///         a code change. Nothing is renounced here.
    /// @param admin Address granted admin, verifier, and pauser roles.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // State-changing entry points
    // ---------------------------------------------------------------------

    /// @notice Registers a batch record, optionally superseding an earlier version.
    /// @dev    Reverts rather than overwriting when `recordHash` is already
    ///         known, which is what makes re-registering an unchanged document
    ///         impossible. A genuine correction differs in `generatedAt` and
    ///         `supersedesRecordHash`, hashes differently, and is accepted.
    /// @param recordHash           keccak256 of the canonical BatchMetadata JSON.
    /// @param batchIdHash          keccak256 over the NFC-normalized batchId.
    /// @param supersedesRecordHash Record being replaced, or zero for an original.
    /// @param status               Initial status; must be ACTIVE or QUARANTINED.
    /// @param metadataURI          Optional public metadata location; may be empty.
    function registerBatch(
        bytes32 recordHash,
        bytes32 batchIdHash,
        bytes32 supersedesRecordHash,
        BatchStatus status,
        string calldata metadataURI
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        if (recordHash == bytes32(0) || batchIdHash == bytes32(0)) revert ZeroHash();
        _requireValidURI(metadataURI);

        if (_batches[recordHash].registeredAt != 0) {
            revert BatchAlreadyRegistered(recordHash);
        }

        // A recall must arrive through `updateBatchStatus` so that it always
        // carries a reason and always emits a status-change event.
        if (status != BatchStatus.ACTIVE && status != BatchStatus.QUARANTINED) {
            revert InvalidInitialStatus(status);
        }

        if (supersedesRecordHash != bytes32(0)) {
            _validateSupersession(recordHash, batchIdHash, supersedesRecordHash, status);
        }

        uint64 timestamp = uint64(block.timestamp);

        _batches[recordHash] = BatchRecord({
            batchIdHash: batchIdHash,
            supersedesRecordHash: supersedesRecordHash,
            supersededByRecordHash: bytes32(0),
            issuer: msg.sender,
            registeredAt: timestamp,
            status: status,
            metadataURI: metadataURI
        });

        _versions[batchIdHash].push(recordHash);

        emit BatchRegistered(
            recordHash, batchIdHash, msg.sender, supersedesRecordHash, status, metadataURI, timestamp
        );

        if (supersedesRecordHash != bytes32(0)) {
            BatchRecord storage predecessor = _batches[supersedesRecordHash];
            BatchStatus previousStatus = predecessor.status;

            predecessor.supersededByRecordHash = recordHash;
            predecessor.status = BatchStatus.SUPERSEDED;

            emit BatchSuperseded(supersedesRecordHash, recordHash, batchIdHash, timestamp);
            emit BatchStatusChanged(
                supersedesRecordHash,
                previousStatus,
                BatchStatus.SUPERSEDED,
                msg.sender,
                bytes32(0),
                "",
                timestamp
            );
        }
    }

    /// @notice Appends a chain-of-custody attestation to an existing record.
    /// @dev    Permitted regardless of the record's status. A recalled batch
    ///         still generates real events — returned stock, disposal — and
    ///         refusing to record them would destroy information rather than
    ///         protect it. Nothing here can modify or remove a prior entry.
    /// @param batchRecordHash  Record the attestation is bound to.
    /// @param attestationHash  keccak256 of the canonical AttestationMetadata JSON.
    /// @param attestationType  Chain-of-custody event type.
    /// @param metadataURI      Optional public attestation location; may be empty.
    function addAttestation(
        bytes32 batchRecordHash,
        bytes32 attestationHash,
        AttestationType attestationType,
        string calldata metadataURI
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        if (batchRecordHash == bytes32(0) || attestationHash == bytes32(0)) revert ZeroHash();
        _requireValidURI(metadataURI);

        if (_batches[batchRecordHash].registeredAt == 0) {
            revert BatchNotFound(batchRecordHash);
        }
        if (_attestationBatch[attestationHash] != bytes32(0)) {
            revert AttestationAlreadyRecorded(attestationHash);
        }

        _attestationBatch[attestationHash] = batchRecordHash;
        unchecked {
            // A uint32 overflow would require ~4.3 billion attestations on a
            // single record, each costing a storage write.
            attestationCount[batchRecordHash] += 1;
        }

        emit AttestationAdded(
            batchRecordHash,
            attestationHash,
            attestationType,
            msg.sender,
            metadataURI,
            uint64(block.timestamp)
        );
    }

    /// @notice Changes a record's lifecycle state.
    /// @dev    Legal transitions are ACTIVE to QUARANTINED, QUARANTINED to
    ///         ACTIVE, and either to RECALLED. RECALLED and SUPERSEDED are
    ///         terminal, and SUPERSEDED can never be set here — only
    ///         `registerBatch` sets it, on the record being replaced.
    ///
    ///         A non-zero `reasonHash` is required for every transition. An
    ///         unexplained recall is not worth recording.
    /// @param recordHash Record to update.
    /// @param newStatus  Target status.
    /// @param reasonHash Canonical hash of the off-chain justification.
    /// @param reasonURI  Optional public location of that justification.
    function updateBatchStatus(
        bytes32 recordHash,
        BatchStatus newStatus,
        bytes32 reasonHash,
        string calldata reasonURI
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        if (recordHash == bytes32(0)) revert ZeroHash();
        if (reasonHash == bytes32(0)) revert MissingReason();
        _requireValidURI(reasonURI);

        BatchRecord storage record = _batches[recordHash];
        if (record.registeredAt == 0) revert BatchNotFound(recordHash);

        BatchStatus current = record.status;

        if (current == BatchStatus.RECALLED || current == BatchStatus.SUPERSEDED) {
            revert InvalidStatusTransition(current, newStatus);
        }
        if (newStatus == BatchStatus.SUPERSEDED) {
            revert InvalidStatusTransition(current, newStatus);
        }
        if (newStatus == current) revert StatusUnchanged(current);

        // Everything reaching this point is legal: `current` is ACTIVE or
        // QUARANTINED, `newStatus` is one of ACTIVE, QUARANTINED, or RECALLED,
        // and the two differ.
        record.status = newStatus;

        emit BatchStatusChanged(
            recordHash, current, newStatus, msg.sender, reasonHash, reasonURI, uint64(block.timestamp)
        );
    }

    /// @notice Halts registration, attestation, and status changes.
    /// @dev    Deliberately blocks recalls too. The realistic reason to pause
    ///         is a compromised verifier key, and an attacker spamming
    ///         fabricated recalls is exactly the damage being stopped. A
    ///         genuine recall during a pause requires an explicit, logged
    ///         `unpause` first.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resumes state-changing entry points.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Public reads
    // ---------------------------------------------------------------------

    /// @notice Whether a batch record has been registered.
    function exists(bytes32 recordHash) external view returns (bool) {
        return _batches[recordHash].registeredAt != 0;
    }

    /// @notice Returns a batch record.
    /// @dev    Reverts on an unknown hash rather than returning a zeroed
    ///         struct, so an interface cannot render an absent record as a real
    ///         one. Superseded records stay fully readable here forever.
    function getBatch(bytes32 recordHash) external view returns (BatchRecord memory) {
        BatchRecord memory record = _batches[recordHash];
        if (record.registeredAt == 0) revert BatchNotFound(recordHash);
        return record;
    }

    /// @notice Current lifecycle state of a record.
    function getBatchStatus(bytes32 recordHash) external view returns (BatchStatus) {
        BatchRecord storage record = _batches[recordHash];
        if (record.registeredAt == 0) revert BatchNotFound(recordHash);
        return record.status;
    }

    /// @notice Whether an attestation hash has been recorded.
    function attestationExists(bytes32 attestationHash) external view returns (bool) {
        return _attestationBatch[attestationHash] != bytes32(0);
    }

    /// @notice The batch record an attestation belongs to, or zero if unknown.
    function attestationBatchOf(bytes32 attestationHash) external view returns (bytes32) {
        return _attestationBatch[attestationHash];
    }

    /// @notice Number of registered versions for a batch id.
    function versionCount(bytes32 batchIdHash) external view returns (uint256) {
        return _versions[batchIdHash].length;
    }

    /// @notice Every version of a batch, oldest first.
    /// @dev    Unbounded in principle; bounded in practice by the fact that only
    ///         trusted verifiers can append and corrections are rare.
    function getVersions(bytes32 batchIdHash) external view returns (bytes32[] memory) {
        return _versions[batchIdHash];
    }

    /// @notice The current head of a batch's version chain.
    /// @dev    O(1): supersession cannot fork, so the chain is linear and the
    ///         most recently registered version is always the head.
    function getLatestRecord(bytes32 batchIdHash) external view returns (bytes32) {
        bytes32[] storage versions = _versions[batchIdHash];
        if (versions.length == 0) revert UnknownBatchId(batchIdHash);
        return versions[versions.length - 1];
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Enforces the supersession invariants. Kept separate so the
    ///      registration path reads as a sequence of intentions.
    function _validateSupersession(
        bytes32 recordHash,
        bytes32 batchIdHash,
        bytes32 supersedesRecordHash,
        BatchStatus status
    ) private view {
        if (supersedesRecordHash == recordHash) revert SelfSupersede();

        BatchRecord storage predecessor = _batches[supersedesRecordHash];

        if (predecessor.registeredAt == 0) revert PredecessorNotFound(supersedesRecordHash);
        if (predecessor.batchIdHash != batchIdHash) {
            revert PredecessorBatchIdMismatch(predecessor.batchIdHash, batchIdHash);
        }
        if (predecessor.supersededByRecordHash != bytes32(0)) {
            revert PredecessorAlreadySuperseded(
                supersedesRecordHash, predecessor.supersededByRecordHash
            );
        }
        if (
            predecessor.status == BatchStatus.RECALLED
                || predecessor.status == BatchStatus.SUPERSEDED
        ) {
            revert CannotSupersedeTerminalRecord(supersedesRecordHash, predecessor.status);
        }
        if (predecessor.status != status) {
            revert PredecessorStatusMismatch(predecessor.status, status);
        }
    }

    /// @dev Empty URIs are allowed on purpose: a batch may be registered as a
    ///      hash alone when publication of the document is not authorized.
    function _requireValidURI(string calldata uri) private pure {
        if (bytes(uri).length > MAX_URI_LENGTH) {
            revert URITooLong(bytes(uri).length, MAX_URI_LENGTH);
        }
    }
}
