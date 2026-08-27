"use client";

import type { Transition } from "motion/react";
import { motion } from "motion/react";
import { clipRevealTransition } from "./animation";

export type ChartRevealClipMode = "reveal" | "conceal";

export interface ChartRevealClipProps {
  clipPathId: string;
  height: number;
  targetWidth: number;
  enterTransition?: Transition;
  /** Bumps when motion settings change to replay the reveal. */
  revealEpoch: number;
  /** Extra inset around the clip rect so edge glyphs are not cut off. */
  padding?: number;
  /** When false, clip stays at full width (no grow animation). */
  animating?: boolean;
  /** Reveal grows 0 → full; conceal shrinks full → 0 (ready → loading). */
  mode?: ChartRevealClipMode;
  /** Called when a conceal animation finishes. */
  onComplete?: () => void;
}

/**
 * Left-to-right clip reveal for cartesian series.
 * Grows clip rect width from 0 → full (true LTR; scaleX is avoided — it reveals from center).
 */
export function ChartRevealClip({
  clipPathId,
  height,
  targetWidth,
  enterTransition,
  revealEpoch,
  padding = 0,
  animating = true,
  mode = "reveal",
  onComplete,
}: ChartRevealClipProps) {
  const transition = clipRevealTransition(enterTransition);
  const paddedWidth = Math.max(0, targetWidth + padding * 2);
  const paddedHeight = height + padding * 2;

  if (!animating) {
    return (
      <clipPath id={clipPathId}>
        <rect
          /**
           * ⚠️ `key` тут обовʼязковий, і `style` — теж.
           *
           * Гілки цього компонента рендерять `<rect>` і `<motion.rect>` —
           * для React це той самий тип елемента на тій самій позиції, тож
           * він ПЕРЕВИКОРИСТОВУЄ той самий DOM-вузол і лише оновлює пропси.
           * А motion під час анімації пише ширину в inline-стиль; у SVG2
           * `width` — геометрична властивість, і CSS-стиль перебиває
           * атрибут. Тому після переходу «revealing → ready» вузол лишався
           * зі стилем `width: <ширина на момент переривання>`, атрибут
           * `width={paddedWidth}` його не перекривав — і clip назавжди
           * застигав вужчим за графік. Назовні це виглядало як лінії, що
           * обриваються десь на третині, при повністю живому графіку:
           * вісь на всю ширину, тултип працює, значення правильні.
           *
           * Окремий `key` дає свіжий вузол без спадку motion, а явний
           * `style` страхує на випадок, якщо вузол усе-таки перевикористали.
           */
          key="static"
          style={{ width: paddedWidth, height: paddedHeight }}
          height={paddedHeight}
          width={paddedWidth}
          x={-padding}
          y={-padding}
        />
      </clipPath>
    );
  }

  if (mode === "conceal") {
    // Mirror the LTR reveal: advance the clip's left edge rightward while width
    // shrinks (same geometry as `LineLoadingPulseStroke` exit half-cycle).
    const rightEdge = -padding + paddedWidth;

    return (
      <clipPath id={clipPathId}>
        <motion.rect
          animate={{ width: 0, x: rightEdge }}
          height={paddedHeight}
          initial={{ width: paddedWidth, x: -padding }}
          key={`motion-conceal-${revealEpoch}`}
          onAnimationComplete={() => onComplete?.()}
          transition={transition}
          y={-padding}
        />
      </clipPath>
    );
  }

  return (
    <clipPath id={clipPathId}>
      <motion.rect
        animate={{ width: paddedWidth }}
        height={paddedHeight}
        initial={{ width: 0 }}
        key={`motion-reveal-${revealEpoch}`}
        transition={transition}
        width={paddedWidth}
        x={-padding}
        y={-padding}
      />
    </clipPath>
  );
}
