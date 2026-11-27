import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';

type HugeIconProps = React.ComponentProps<typeof HugeiconsIcon>;

export type IconData = HugeIconProps['icon'];

export interface HugeIconViewProps
  extends Omit<HugeIconProps, 'icon' | 'size' | 'strokeWidth'> {
  icon: IconData;
  size?: number;
  strokeWidth?: number;
}

/** Project-wide defaults for the stroke-rounded Hugeicons set. */
export const HugeIcon: React.FC<HugeIconViewProps> = ({
  size = 16,
  strokeWidth = 1.8,
  ...props
}) => <HugeiconsIcon size={size} strokeWidth={strokeWidth} {...props} />;
