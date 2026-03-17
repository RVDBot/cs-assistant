'use client'

// Spotify Kids-style monster avatar generator
// Deterministic: same phone number always produces the same monster
// Vivid colors, blobby shapes, fun accessories

const BODY_COLORS = [
  '#4A6CF7', // blue
  '#F7B731', // yellow
  '#FC5C65', // pink-red
  '#26DE81', // green
  '#FD9644', // orange
  '#A55EEA', // purple
  '#2BCBBA', // teal/mint
  '#F78FB3', // pink
  '#45AAF2', // sky blue
  '#EB3B5A', // crimson
  '#20BF6B', // emerald
  '#FF6348', // coral
]

const HAIR_COLORS = [
  '#1B2A6B', // dark blue
  '#D63031', // red
  '#6C5CE7', // purple
  '#00B894', // mint
  '#E17055', // orange
  '#0984E3', // blue
  '#FF6B81', // pink
  '#A29BFE', // lavender
  '#FDCB6E', // gold
  '#00CEC9', // cyan
  '#E84393', // magenta
  '#55E6C1', // light green
]

const ACCESSORY_COLORS = [
  '#FFD32A', '#FF3838', '#3AE374', '#17C0EB',
  '#FF9F1A', '#F368E0', '#48DBFB', '#FF6B6B',
]

const BG_COLORS = [
  '#8854D0', // purple
  '#3867D6', // blue
  '#20BF6B', // green
  '#F7B731', // yellow
  '#EB3B5A', // red
  '#FC5C65', // pink
  '#0FB9B1', // teal
  '#FA8231', // orange
  '#4B7BEC', // royal blue
  '#A55EEA', // violet
  '#2BCBBA', // mint
  '#FD9644', // tangerine
]

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function pick<T>(arr: T[], h: number, offset = 0): T {
  return arr[(h + offset) % arr.length]
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

function pickBg(h: number, avoid: string[]): string {
  const minDist = 120
  for (let i = 0; i < BG_COLORS.length; i++) {
    const candidate = BG_COLORS[(h + i) % BG_COLORS.length]
    if (avoid.every(c => colorDistance(candidate, c) > minDist)) return candidate
  }
  // Fallback: pick the one with maximum distance from all avoided colors
  let best = BG_COLORS[0]
  let bestDist = 0
  for (const c of BG_COLORS) {
    const d = Math.min(...avoid.map(a => colorDistance(c, a)))
    if (d > bestDist) { bestDist = d; best = c }
  }
  return best
}

interface Props {
  /** @deprecated Use identifier instead */
  phone?: string
  identifier?: string
  size?: number
  className?: string
}

export default function MonsterAvatar({ phone, identifier, size = 48, className }: Props) {
  const id = identifier || phone || 'x'
  const h = hash(id)
  const h2 = hash(id + 'a')
  const h3 = hash(id + 'b')
  const h4 = hash(id + 'c')
  const h5 = hash(id + 'd')
  const h6 = hash(id + 'e')
  const h7 = hash(id + 'f')
  const h8 = hash(id + 'g')

  const bodyColor = pick(BODY_COLORS, h)
  const hairColor = pick(HAIR_COLORS, h2)
  const accentColor = pick(ACCESSORY_COLORS, h3)
  const bgColor = pickBg(h8, [bodyColor, hairColor, accentColor])
  const bodyShape = h % 4 // 0: round, 1: tall, 2: wide, 3: blob
  const eyeStyle = h4 % 7 // 0: normal, 1: big, 2: cyclops, 3: star-glasses, 4: sunglasses, 5: shutter-shades, 6: sleepy
  const mouthStyle = h5 % 6 // 0: smile, 1: open, 2: one-tooth, 3: teeth, 4: fangs, 5: wide-grin
  const hairStyle = h6 % 8 // 0: none, 1: afro, 2: cap, 3: messy, 4: bowler-hat, 5: bun, 6: long-side, 7: spiky
  const accessory = h7 % 6 // 0: none, 1: tie, 2: earring, 3: mustache, 4: bow, 5: bracelets

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: '50%', minWidth: size, minHeight: size }}
    >
      {/* Background */}
      <circle cx="50" cy="50" r="50" fill={bgColor} />

      {/* Hair behind body (afro, long hair) */}
      {hairStyle === 1 && (
        <circle cx="50" cy="38" r="32" fill={hairColor} />
      )}
      {hairStyle === 6 && (
        <ellipse cx="68" cy="50" rx="20" ry="30" fill={hairColor} />
      )}

      {/* Body */}
      {bodyShape === 0 && (
        <ellipse cx="50" cy="58" rx="26" ry="24" fill={bodyColor} />
      )}
      {bodyShape === 1 && (
        <rect x="28" y="32" width="44" height="48" rx="20" fill={bodyColor} />
      )}
      {bodyShape === 2 && (
        <ellipse cx="50" cy="60" rx="30" ry="22" fill={bodyColor} />
      )}
      {bodyShape === 3 && (
        <path d="M24 58 Q24 32 50 30 Q76 32 76 58 Q76 82 50 84 Q24 82 24 58Z" fill={bodyColor} />
      )}

      {/* Arms */}
      <ellipse cx="20" cy="62" rx="6" ry="4" fill={bodyColor} />
      <ellipse cx="80" cy="62" rx="6" ry="4" fill={bodyColor} />

      {/* Feet */}
      <ellipse cx="40" cy="84" rx="7" ry="4" fill={bodyColor} />
      <ellipse cx="60" cy="84" rx="7" ry="4" fill={bodyColor} />

      {/* Hair/headwear in front */}
      {hairStyle === 2 && (
        // Baseball cap
        <>
          <ellipse cx="50" cy="34" rx="24" ry="8" fill={accentColor} />
          <rect x="28" y="26" width="44" height="10" rx="5" fill={accentColor} />
          <rect x="52" y="32" width="22" height="5" rx="2" fill={accentColor} />
        </>
      )}
      {hairStyle === 3 && (
        // Messy hair
        <>
          <circle cx="36" cy="32" r="10" fill={hairColor} />
          <circle cx="50" cy="28" r="11" fill={hairColor} />
          <circle cx="64" cy="32" r="10" fill={hairColor} />
          <circle cx="42" cy="26" r="7" fill={hairColor} />
          <circle cx="58" cy="24" r="8" fill={hairColor} />
        </>
      )}
      {hairStyle === 4 && (
        // Bowler hat
        <>
          <ellipse cx="50" cy="34" rx="22" ry="5" fill="#2D3436" />
          <rect x="34" y="18" width="32" height="18" rx="14" fill="#2D3436" />
        </>
      )}
      {hairStyle === 5 && (
        // Bun on top
        <>
          <circle cx="50" cy="26" r="10" fill={hairColor} />
          <rect x="46" y="30" width="8" height="6" fill={hairColor} />
        </>
      )}
      {hairStyle === 7 && (
        // Spiky
        <>
          <polygon points="35,34 38,14 42,32" fill={hairColor} />
          <polygon points="44,30 48,8 52,28" fill={hairColor} />
          <polygon points="54,30 58,12 62,32" fill={hairColor} />
          <polygon points="62,34 66,18 68,34" fill={hairColor} />
        </>
      )}

      {/* Eyes */}
      {eyeStyle === 0 && (
        // Normal round eyes
        <>
          <circle cx="40" cy="52" r="7" fill="white" />
          <circle cx="60" cy="52" r="7" fill="white" />
          <circle cx="42" cy="53" r="3.5" fill="#1a1a2e" />
          <circle cx="62" cy="53" r="3.5" fill="#1a1a2e" />
          <circle cx="43.5" cy="51.5" r="1.2" fill="white" />
          <circle cx="63.5" cy="51.5" r="1.2" fill="white" />
        </>
      )}
      {eyeStyle === 1 && (
        // Big googly eyes
        <>
          <circle cx="38" cy="50" r="10" fill="white" />
          <circle cx="62" cy="50" r="10" fill="white" />
          <circle cx="41" cy="52" r="5" fill="#1a1a2e" />
          <circle cx="65" cy="52" r="5" fill="#1a1a2e" />
          <circle cx="43" cy="50" r="1.8" fill="white" />
          <circle cx="67" cy="50" r="1.8" fill="white" />
        </>
      )}
      {eyeStyle === 2 && (
        // Cyclops
        <>
          <circle cx="50" cy="50" r="12" fill="white" />
          <circle cx="52" cy="52" r="6" fill="#1a1a2e" />
          <circle cx="54" cy="50" r="2" fill="white" />
        </>
      )}
      {eyeStyle === 3 && (
        // Star glasses
        <>
          <polygon points="40,44 42.5,50 48,50 43.5,54 45,60 40,56 35,60 36.5,54 32,50 37.5,50" fill={accentColor} />
          <polygon points="60,44 62.5,50 68,50 63.5,54 65,60 60,56 55,60 56.5,54 52,50 57.5,50" fill={accentColor} />
          <circle cx="40" cy="52" r="2" fill="#1a1a2e" />
          <circle cx="60" cy="52" r="2" fill="#1a1a2e" />
        </>
      )}
      {eyeStyle === 4 && (
        // Sunglasses
        <>
          <rect x="28" y="46" width="20" height="13" rx="6" fill="#2D3436" />
          <rect x="52" y="46" width="20" height="13" rx="6" fill="#2D3436" />
          <rect x="48" y="50" width="4" height="3" rx="1" fill="#2D3436" />
          <rect x="32" y="49" width="5" height="3" rx="1" fill="white" opacity="0.3" />
          <rect x="56" y="49" width="5" height="3" rx="1" fill="white" opacity="0.3" />
        </>
      )}
      {eyeStyle === 5 && (
        // Shutter shades
        <>
          <rect x="28" y="46" width="20" height="14" rx="3" fill={accentColor} />
          <rect x="52" y="46" width="20" height="14" rx="3" fill={accentColor} />
          <rect x="48" y="50" width="4" height="3" fill={accentColor} />
          {[0, 1, 2, 3].map(i => (
            <rect key={`l${i}`} x="29" y={47 + i * 3.5} width="18" height="1.5" rx="0.5" fill={bgColor} />
          ))}
          {[0, 1, 2, 3].map(i => (
            <rect key={`r${i}`} x="53" y={47 + i * 3.5} width="18" height="1.5" rx="0.5" fill={bgColor} />
          ))}
        </>
      )}
      {eyeStyle === 6 && (
        // Sleepy/content eyes
        <>
          <path d="M33 52 Q40 46 47 52" fill="none" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" />
          <path d="M53 52 Q60 46 67 52" fill="none" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      {/* Mouth */}
      {mouthStyle === 0 && (
        // Simple smile
        <path d="M38 66 Q50 76 62 66" fill="none" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {mouthStyle === 1 && (
        // Open mouth
        <ellipse cx="50" cy="68" rx="10" ry="7" fill="#1a1a2e" />
      )}
      {mouthStyle === 2 && (
        // One tooth grin
        <>
          <path d="M36 64 Q50 78 64 64 Z" fill="#1a1a2e" />
          <rect x="47" y="64" width="6" height="5" rx="1.5" fill="white" />
        </>
      )}
      {mouthStyle === 3 && (
        // Full teeth smile
        <>
          <path d="M36 64 Q50 78 64 64 Z" fill="#1a1a2e" />
          <rect x="38" y="64" width="6" height="4" rx="1" fill="white" />
          <rect x="45" y="64" width="6" height="4" rx="1" fill="white" />
          <rect x="52" y="64" width="6" height="4" rx="1" fill="white" />
          <rect x="59" y="64" width="5" height="4" rx="1" fill="white" />
        </>
      )}
      {mouthStyle === 4 && (
        // Fangs
        <>
          <path d="M38 65 Q50 74 62 65 Z" fill="#1a1a2e" />
          <polygon points="41,65 45,65 43,72" fill="white" />
          <polygon points="55,65 59,65 57,72" fill="white" />
        </>
      )}
      {mouthStyle === 5 && (
        // Wide grin
        <>
          <path d="M32 62 Q50 80 68 62 Z" fill="#1a1a2e" />
          <path d="M32 62 L68 62 L64 66 L36 66 Z" fill="white" />
        </>
      )}

      {/* Accessories */}
      {accessory === 1 && (
        // Tie
        <>
          <polygon points="50,72 46,78 50,90 54,78" fill={accentColor} />
          <rect x="46" y="71" width="8" height="4" rx="1" fill={accentColor} />
        </>
      )}
      {accessory === 2 && (
        // Earring
        <circle cx="76" cy="56" r="3" fill={accentColor} />
      )}
      {accessory === 3 && eyeStyle !== 4 && eyeStyle !== 5 && (
        // Mustache (only if no glasses covering area)
        <path d="M38 62 Q44 58 50 62 Q56 58 62 62 Q56 66 50 64 Q44 66 38 62Z" fill={hairColor} />
      )}
      {accessory === 4 && (
        // Bow
        <>
          <polygon points="28,42 20,36 20,48" fill={accentColor} />
          <polygon points="28,42 36,36 36,48" fill={accentColor} />
          <circle cx="28" cy="42" r="3" fill={accentColor} />
        </>
      )}
      {accessory === 5 && (
        // Bracelets on arms
        <>
          <rect x="14" y="60" width="8" height="3" rx="1" fill={accentColor} />
          <rect x="14" y="64" width="8" height="3" rx="1" fill="#FFD32A" />
          <rect x="78" y="60" width="8" height="3" rx="1" fill={accentColor} />
          <rect x="78" y="64" width="8" height="3" rx="1" fill="#FFD32A" />
        </>
      )}

      {/* Cheeks (subtle blush) */}
      <circle cx="30" cy="62" r="4" fill="#FF6B6B" opacity="0.2" />
      <circle cx="70" cy="62" r="4" fill="#FF6B6B" opacity="0.2" />
    </svg>
  )
}
