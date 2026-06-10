/**
 * DecryptedText - Text scramble/decrypt animation.
 * Adapted from reactbits.dev (MIT).
 * Simplified version: animates on view (IntersectionObserver).
 */

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'

interface DecryptedTextProps {
  text: string
  speed?: number
  maxIterations?: number
  sequential?: boolean
  revealDirection?: 'start' | 'end' | 'center'
  useOriginalCharsOnly?: boolean
  characters?: string
  className?: string
  parentClassName?: string
  encryptedClassName?: string
  animateOn?: 'hover' | 'view'
  loop?: boolean
  loopDelay?: number
}

export default function DecryptedText({
  text,
  speed = 50,
  maxIterations = 10,
  sequential = true,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'view',
  loop = false,
  loopDelay = 1000,
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text)
  const [isAnimating, setIsAnimating] = useState(false)
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())
  const [hasAnimated, setHasAnimated] = useState(false)
  const [isDecrypted, setIsDecrypted] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const availableChars = useMemo(() => {
    return useOriginalCharsOnly
      ? Array.from(new Set(text.split(''))).filter((c) => c !== ' ')
      : characters.split('')
  }, [useOriginalCharsOnly, text, characters])

  const shuffleText = useCallback(
    (originalText: string, currentRevealed: Set<number>) => {
      return originalText
        .split('')
        .map((char, i) => {
          if (char === ' ') return ' '
          if (currentRevealed.has(i)) return originalText[i]
          return availableChars[Math.floor(Math.random() * availableChars.length)]
        })
        .join('')
    },
    [availableChars],
  )

  const triggerDecrypt = useCallback(() => {
    setRevealedIndices(new Set())
    setIsAnimating(true)
  }, [])

  // Animation loop
  useEffect(() => {
    if (!isAnimating) return

    let currentIteration = 0
    let revealed = new Set<number>()

    intervalRef.current = setInterval(() => {
      if (sequential) {
        // Reveal one character at a time
        const nextIdx = revealDirection === 'end'
          ? text.length - 1 - revealed.size
          : revealDirection === 'center'
            ? (() => {
              const mid = Math.floor(text.length / 2)
              const off = Math.floor(revealed.size / 2)
              return revealed.size % 2 === 0 ? mid + off : mid - off - 1
            })()
            : revealed.size

        if (nextIdx >= 0 && nextIdx < text.length) {
          revealed = new Set(revealed)
          revealed.add(nextIdx)
          setRevealedIndices(new Set(revealed))
          setDisplayText(shuffleText(text, revealed))
        }

        if (revealed.size >= text.length) {
          clearInterval(intervalRef.current!)
          setIsAnimating(false)
          setIsDecrypted(true)
          setDisplayText(text)
        }
      } else {
        setDisplayText(shuffleText(text, revealed))
        currentIteration++
        if (currentIteration >= maxIterations) {
          clearInterval(intervalRef.current!)
          setIsAnimating(false)
          setIsDecrypted(true)
          setDisplayText(text)
        }
      }
    }, speed)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAnimating, text, speed, maxIterations, sequential, revealDirection, shuffleText])

  // Loop: restart animation after completion
  useEffect(() => {
    if (!loop || isAnimating || !isDecrypted) return

    const timer = setTimeout(() => {
      setRevealedIndices(new Set())
      setIsDecrypted(false)
      setDisplayText(shuffleText(text, new Set()))
      setIsAnimating(true)
    }, loopDelay)

    return () => clearTimeout(timer)
  }, [loop, loopDelay, isAnimating, isDecrypted, text, shuffleText])

  // IntersectionObserver trigger
  useEffect(() => {
    if (animateOn !== 'view') return
    if (hasAnimated) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          triggerDecrypt()
          setHasAnimated(true)
        }
      },
      { threshold: 0.1 },
    )

    const el = containerRef.current
    if (el) observer.observe(el)
    return () => { if (el) observer.unobserve(el) }
  }, [animateOn, hasAnimated, triggerDecrypt])

  // Hover trigger
  const handleMouseEnter = useCallback(() => {
    if (animateOn !== 'hover' || isAnimating) return
    setRevealedIndices(new Set())
    setIsDecrypted(false)
    setIsAnimating(true)
  }, [animateOn, isAnimating])

  const handleMouseLeave = useCallback(() => {
    if (animateOn !== 'hover') return
    if (intervalRef.current) clearInterval(intervalRef.current)
    setIsAnimating(false)
    setRevealedIndices(new Set())
    setDisplayText(text)
    setIsDecrypted(true)
  }, [animateOn, text])

  // Initial state
  useEffect(() => {
    if (animateOn === 'view') {
      // Start encrypted
      setDisplayText(shuffleText(text, new Set()))
      setIsDecrypted(false)
    } else {
      setDisplayText(text)
      setIsDecrypted(true)
    }
  }, [animateOn, text, shuffleText])

  return (
    <span
      ref={containerRef}
      className={parentClassName}
      style={{ display: 'inline-block', whiteSpace: 'pre-wrap' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span aria-hidden="true">
        {displayText.split('').map((char, index) => {
          const isRevealed = revealedIndices.has(index) || (!isAnimating && isDecrypted)
          return (
            <span key={index} className={isRevealed ? className : encryptedClassName}>
              {char}
            </span>
          )
        })}
      </span>
    </span>
  )
}
