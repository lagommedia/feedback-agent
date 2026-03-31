'use client'

import Link from 'next/link'
import { buttonVariants } from './button'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type Size = 'default' | 'sm' | 'lg' | 'icon' | 'xs'

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant
  size?: Size
}

export function LinkButton({ variant = 'default', size = 'default', className, ...props }: LinkButtonProps) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
