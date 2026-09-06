import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/*
 * =========================================================
 * TOKEN CIPHER (AES-256-GCM, additive)
 *
 * Encrypts OAuth tokens before database storage.
 * Read path accepts both encrypted (`enc:...`)
 * and legacy plaintext values so existing rows
 * keep working and migrate lazily on next write.
 *
 * Key: TOKEN_ENCRYPTION_KEY (any strong secret;
 * derived to 32 bytes via SHA-256). Without it,
 * values are stored as-is and a warning is logged
 * once — production must set the key.
 * =========================================================
 */

const PREFIX = 'enc:';

let warnedMissingKey = false;

function keyBytes(): Buffer | null {
  const raw =
    process.env.TOKEN_ENCRYPTION_KEY?.trim();

  if (!raw) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;

      console.warn(
        '[token-cipher] TOKEN_ENCRYPTION_KEY is not set; OAuth tokens are stored without encryption.',
      );
    }

    return null;
  }

  return createHash('sha256')
    .update(raw)
    .digest();
}

export function encryptToken(
  plaintext: string,
): string {
  if (!plaintext) {
    return plaintext;
  }

  const key = keyBytes();

  if (!key) {
    return plaintext;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    key,
    iv,
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptToken(
  stored: string | null | undefined,
): string {
  if (!stored) {
    return '';
  }

  if (!stored.startsWith(PREFIX)) {
    return stored;
  }

  const key = keyBytes();

  if (!key) {
    return '';
  }

  const parts = stored
    .slice(PREFIX.length)
    .split('.');

  if (parts.length !== 3) {
    return '';
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parts[0], 'base64url'),
    );

    decipher.setAuthTag(
      Buffer.from(parts[2], 'base64url'),
    );

    return (
      decipher.update(
        parts[1],
        'base64url',
        'utf8',
      ) + decipher.final('utf8')
    );
  } catch {
    return '';
  }
}

export function isTokenEncrypted(
  stored: string | null | undefined,
): boolean {
  return Boolean(
    stored?.startsWith(PREFIX),
  );
}
