import React from 'react'
import { Box, Divider, IconButton, Tooltip, Typography } from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import DnsIcon from '@mui/icons-material/Dns'
import SettingsIcon from '@mui/icons-material/Settings'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import { useAppDispatch, useAppSelector } from '../store/store'
import { setThemePreference } from '../store/fbcskmSlice'
import type { ThemePreference } from '../theme'
import BMCHelixLogo from '../../logo/BMCHelix Logo Medium Transparent.png'
import MatrixLogo from '../../logo/Matrix-Logo-Flat.png'
import MatrixKBLogo from '../../logo/MatrixKB for BMC Helix.png'

export type AppView = 'editor' | 'agentic' | 'hosts'

const THEME_LABELS: Record<ThemePreference, string> = { light: 'Light', dark: 'Dark', system: 'System' }
const THEME_NEXT: Record<ThemePreference, ThemePreference> = { light: 'dark', dark: 'system', system: 'light' }
const THEME_ICONS: Record<ThemePreference, React.ReactNode> = {
  light: <LightModeIcon fontSize='small' />,
  dark: <DarkModeIcon fontSize='small' />,
  system: <BrightnessAutoIcon fontSize='small' />,
}

export default function AppShell({ view, onViewChange, onOpenSettings, onOpenHelp, electronAction, children }: {
  view: AppView
  onViewChange: (view: AppView) => void
  onOpenSettings: () => void
  onOpenHelp: () => void
  electronAction?: React.ReactNode
  children: React.ReactNode
}) {
  const dispatch = useAppDispatch()
  const themePreference = useAppSelector(state => state.fbcskm.themePreference)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box component='nav' sx={{
        width: 64, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        py: 1.5, gap: 0.5, borderRight: '1px solid', borderColor: 'divider',
        backgroundColor: 'background.paper', position: 'sticky', top: 0, height: '100vh'
      }}>
        <Tooltip title='MatrixKB for BMC Helix' placement='right'>
          <Box sx={{
            width: 52, height: 28, mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 1, backgroundColor: '#ffffff', border: '1px solid', borderColor: 'divider', overflow: 'hidden',
          }}>
            <Box component='img' src={MatrixKBLogo} alt='MatrixKB' sx={{ width: 48, height: 'auto', display: 'block' }} />
          </Box>
        </Tooltip>

        <Tooltip title='Configuration Editor' placement='right'>
          <IconButton color={view === 'editor' ? 'primary' : 'default'} onClick={() => onViewChange('editor')} aria-label='configuration editor'>
            <DashboardIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title='Agentic Scripting' placement='right'>
          <IconButton color={view === 'agentic' ? 'primary' : 'default'} onClick={() => onViewChange('agentic')} aria-label='agentic scripting'>
            <AutoAwesomeIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title='Execution Hosts' placement='right'>
          <IconButton color={view === 'hosts' ? 'primary' : 'default'} onClick={() => onViewChange('hosts')} aria-label='execution hosts'>
            <DnsIcon />
          </IconButton>
        </Tooltip>

        <Divider sx={{ width: '60%', my: 1 }} />

        <Tooltip title={`Theme: ${THEME_LABELS[themePreference]} — click for ${THEME_LABELS[THEME_NEXT[themePreference]]}`} placement='right'>
          <IconButton onClick={() => dispatch(setThemePreference(THEME_NEXT[themePreference]))} aria-label='toggle color theme'>
            {THEME_ICONS[themePreference]}
          </IconButton>
        </Tooltip>

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
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, pb: 0.5 }}>
          <Tooltip title='Matrix' placement='right'>
            <Box sx={{
              width: 52, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 1, backgroundColor: '#ffffff', border: '1px solid', borderColor: 'divider', overflow: 'hidden',
            }}>
              <Box component='img' src={MatrixLogo} alt='Matrix' sx={{ width: 48, height: 'auto', display: 'block' }} />
            </Box>
          </Tooltip>
          <Tooltip title='BMC Helix' placement='right'>
            <Box sx={{
              width: 52, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 1, backgroundColor: '#ffffff', border: '1px solid', borderColor: 'divider', overflow: 'hidden',
            }}>
              <Box component='img' src={BMCHelixLogo} alt='BMC Helix' sx={{ width: 48, height: 'auto', display: 'block' }} />
            </Box>
          </Tooltip>
        </Box>
      </Box>

      <Box component='main' sx={{ flex: 1, minWidth: 0, px: 3, py: 3 }}>
        {children}
      </Box>
    </Box>
  )
}
