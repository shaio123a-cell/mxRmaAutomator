import React from 'react'
import { Box, Divider, IconButton, Tooltip, Typography } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import SettingsIcon from '@mui/icons-material/Settings'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import BMCHelixLogo from '../../logo/BMCHelix Logo Medium Transparent.png'
import MatrixLogo from '../../logo/Matrix-Logo-Flat.png'
import MatrixKBLogo from '../../logo/MatrixKB for BMC Helix.png'

export type AppView = 'editor' | 'agentic'

export default function AppShell({ view, onViewChange, onOpenSettings, onOpenHelp, electronAction, children }: {
  view: AppView
  onViewChange: (view: AppView) => void
  onOpenSettings: () => void
  onOpenHelp: () => void
  electronAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box component='nav' sx={{
        width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        py: 1.5, gap: 0.5, borderRight: '1px solid', borderColor: 'divider',
        backgroundColor: 'background.paper', position: 'sticky', top: 0, height: '100vh'
      }}>
        <Tooltip title='MatrixKB for BMC Helix' placement='right'>
          <Box component='img' src={MatrixKBLogo} alt='MatrixKB' sx={{ height: 28, mb: 1, objectFit: 'contain' }} />
        </Tooltip>

        <Tooltip title='Configuration Editor' placement='right'>
          <IconButton color={view === 'editor' ? 'primary' : 'default'} onClick={() => onViewChange('editor')} aria-label='configuration editor'>
            <DashboardIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title='Agentic Scripting' placement='right'>
          <IconButton color={view === 'agentic' ? 'primary' : 'default'} onClick={() => onViewChange('agentic')} aria-label='agentic scripting'>
            <SmartToyIcon />
          </IconButton>
        </Tooltip>

        <Divider sx={{ width: '60%', my: 1 }} />

        <Tooltip title='Settings' placement='right'>
          <IconButton onClick={onOpenSettings} aria-label='settings'>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title='Help' placement='right'>
          <IconButton onClick={onOpenHelp} aria-label='help'>
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>

        {electronAction}

        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, pb: 0.5 }}>
          <Box component='img' src={MatrixLogo} alt='Matrix' sx={{ height: 20 }} />
          <Box component='img' src={BMCHelixLogo} alt='BMC Helix' sx={{ height: 22, background: 'transparent' }} />
        </Box>
      </Box>

      <Box component='main' sx={{ flex: 1, minWidth: 0, px: 3, py: 3 }}>
        {children}
      </Box>
    </Box>
  )
}
