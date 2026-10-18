import React from 'react'
import { createTheme, ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material'
import { useAppSelector } from './store/store'

export type ThemePreference = 'light' | 'dark' | 'system'

const brandPrimary = '#0b3d91'

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: brandPrimary },
    secondary: { main: '#4a148c' },
    background: { default: '#f4f6fa', paper: '#ffffff' },
  },
})

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#5b8fd4' },
    secondary: { main: '#ce93d8' },
    background: { default: '#12151c', paper: '#1a1f29' },
  },
})

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useAppSelector(s => s.fbcskm.themePreference)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const mode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
  const theme = mode === 'dark' ? darkTheme : lightTheme
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
