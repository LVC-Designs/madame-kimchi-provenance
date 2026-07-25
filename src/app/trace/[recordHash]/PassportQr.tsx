"use client";

import { QRCodeSVG } from "qrcode.react";
import { useSyncExternalStore } from "react";

/** The origin is a browser fact, so it is read as external state rather than
 *  assigned into React state from an effect. On the server the snapshot is
 *  `null`, which renders a placeholder and hydrates cleanly. */
const subscribeToNothing = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => null;

/**
 * QR code addressing this Batch Passport.
 *
 * The URL is resolved on the client from the real location, falling back to
 * `NEXT_PUBLIC_SITE_URL`. A QR printed on a jar has to work for whoever scans
 * it, so it must carry an absolute, publicly reachable URL — never a relative
 * path, and never localhost on a build that will be deployed.
 *
 * Rendered as SVG so it stays sharp on a label at any size, and light-on-dark
 * is inverted here: scanners expect dark modules on a light field, and a QR
 * drawn in the ink palette would simply fail to read.
 */
export function PassportQr({ recordHash }: { recordHash: string }) {
  const detectedOrigin = useSyncExternalStore(
    subscribeToNothing,
    clientOrigin,
    serverOrigin,
  );

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin =
    configured !== undefined && configured !== ""
      ? configured.replace(/\/$/, "")
      : detectedOrigin;

  const url = origin === null ? null : `${origin}/trace/${recordHash}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-sm bg-white p-3">
        {url === null ? (
          <div className="size-[148px] animate-pulse bg-neutral-200" />
        ) : (
          <QRCodeSVG
            value={url}
            size={148}
            level="M"
            marginSize={0}
            bgColor="#ffffff"
            fgColor="#0a0b0e"
          />
        )}
      </div>

      <p className="text-ink-400 max-w-[16rem] text-center text-[11px] leading-relaxed">
        Scan to open this public Batch Passport.
      </p>

      {url !== null && (
        <code className="text-ink-400 max-w-[16rem] text-center font-mono text-[11px] break-all">
          {url}
        </code>
      )}
    </div>
  );
}
