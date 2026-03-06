declare module "canvas-confetti" {
  type ConfettiOptions = {
    angle?: number;
    origin?: {
      x?: number;
      y?: number;
    };
    particleCount?: number;
    spread?: number;
  };

  export default function confetti(
    options?: ConfettiOptions,
  ): Promise<null> | null;
}
