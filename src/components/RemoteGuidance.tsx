import React, { useState } from 'react'
import { Alert, Box, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import type { RemoteOs, RemoteTransport } from '../services/remoteTypes'

export function CommandHint({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'action.hover', borderRadius: 1, px: 1, py: 0.5 }}>
      <Typography variant='caption' sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{command}</Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size='small' onClick={() => void copy()} aria-label='copy command'>
          {copied ? <CheckIcon fontSize='small' color='success' /> : <ContentCopyIcon fontSize='small' />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}

export function GuideBox({ title, lines, commands, tone = 'info' }: { title: string, lines: string[], commands?: string[], tone?: 'info' | 'warning' }) {
  return (
    <Alert severity={tone === 'warning' ? 'warning' : 'info'} sx={{ alignItems: 'flex-start' }}>
      <Typography variant='subtitle2'>{title}</Typography>
      {lines.map(line => <Typography key={line} variant='body2' sx={{ mt: 0.5 }}>{line}</Typography>)}
      {commands && commands.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {commands.map(command => <CommandHint key={command} command={command} />)}
        </Stack>
      )}
    </Alert>
  )
}

export function StepList({ steps }: { steps: string[] }) {
  return (
    <Box component='ol' sx={{ m: 0, pl: 2.5 }}>
      {steps.map(step => <Typography key={step} component='li' variant='body2' sx={{ mb: 0.4 }}>{step}</Typography>)}
    </Box>
  )
}

export function transportGuidance(os: RemoteOs, transport: RemoteTransport): { title: string, lines: string[], commands?: string[], warning?: string } {
  if (os === 'linux') {
    if (transport !== 'ssh') {
      return {
        title: 'Linux servers need SSH',
        lines: ['Windows transports (WinRM / PowerShell Remoting) do not work against Linux. Choose SSH / OpenSSH.'],
        warning: 'This combination will fail. Change the transport to SSH / OpenSSH.',
      }
    }
    return {
      title: 'Linux over SSH',
      lines: [
        'The target must run an SSH server on port 22 and allow this account to sign in.',
        'To check on the server, run: sudo systemctl status ssh',
      ],
      commands: ['sudo systemctl enable --now ssh'],
    }
  }
  if (transport === 'ssh') {
    return {
      title: 'Windows over OpenSSH',
      lines: [
        'OpenSSH Server must be installed and running on the Windows target.',
        'Run these commands in an Administrator PowerShell on the target:',
      ],
      commands: [
        'Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0',
        'Start-Service sshd',
        'Set-Service -Name sshd -StartupType Automatic',
      ],
    }
  }
  return {
    title: 'Windows over WinRM / PowerShell Remoting',
    lines: [
      'WinRM must be enabled on the Windows target and the account must be allowed to connect.',
      'Run this in an Administrator PowerShell on the target:',
    ],
    commands: ['Enable-PSRemoting -Force'],
  }
}
