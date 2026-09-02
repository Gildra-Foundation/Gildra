import { defineBlock, type BlockComponentProps, type EmptyProps } from "@/lib/blocks/types";
import { Container } from "@/components/layout/Container";

export type ContainerProps = { variant?: "default" | "route"; className?: string };

/** Page-width column (`.section`) holding other blocks. */
function ContainerBlock({ variant, className, children }: BlockComponentProps<ContainerProps, undefined>) {
  return <Container variant={variant} className={className}>{children}</Container>;
}

export const containerBlock = defineBlock<ContainerProps, undefined, true>({
  type: "container",
  Component: ContainerBlock,
  container: true,
  demo: { props: {}, data: undefined, note: "Layout wrapper — renders its children." },
});

export type { EmptyProps };
