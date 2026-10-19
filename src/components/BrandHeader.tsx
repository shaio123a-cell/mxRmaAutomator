import React from 'react'
import { Box, Typography } from '@mui/material'

export default function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <Box
      sx={theme => ({
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        px: { xs: 2, sm: 3 },
        py: compact ? 1.5 : 2.5,
        border: '1px solid',
        borderColor: 'divider',
        background:
          theme.palette.mode === 'dark'
            ? 'linear-gradient(120deg, rgba(91,143,212,0.20) 0%, rgba(206,147,216,0.14) 55%, rgba(26,31,41,0) 100%)'
            : 'linear-gradient(120deg, #eef4ff 0%, #f6f0ff 55%, #ffffff 100%)',
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          right: 0,
          width: 220,
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(11,61,145,0.06))',
          pointerEvents: 'none',
        },
      })}
    >
      <Typography
        component='h1'
        sx={{
          fontWeight: 800,
          letterSpacing: { xs: '0.06em', sm: '0.14em' },
          fontSize: { xs: '1.35rem', sm: compact ? '1.5rem' : '2rem' },
          lineHeight: 1.1,
          background: theme =>
            theme.palette.mode === 'dark'
              ? 'linear-gradient(90deg, #9cc2f0 0%, #e1b3ea 100%)'
              : 'linear-gradient(90deg, #0b3d91 0%, #4a148c 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        SUPERSONIC
      </Typography>
      <Typography
        variant='body2'
        sx={{
          mt: 0.5,
          fontWeight: 600,
          letterSpacing: { xs: '0.08em', sm: '0.16em' },
          textTransform: 'uppercase',
          fontSize: { xs: '0.6rem', sm: '0.72rem' },
          color: 'text.secondary',
        }}
      >
        MatrixKB Accelerator for BMC PATROL for Scripting
      </Typography>
    </Box>
  )
}
