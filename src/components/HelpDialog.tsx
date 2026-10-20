import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import BrandHeader from './BrandHeader'
import { helpSections, topicMatches, type HelpLink, type HelpNavTarget, type HelpSection, type HelpTopic } from '../content/helpContent'

import BMCHelixLogo from '../../logo/BMCHelix Logo Medium Transparent.png'
import MatrixLogo from '../../logo/Matrix-Logo-Flat.png'
import MatrixKBLogo from '../../logo/MatrixKB for BMC Helix.png'

const APP_VERSION = '3.0.00'

const logoSurfaceSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: '#ffffff',
  borderRadius: 2,
  border: '1px solid',
  borderColor: 'divider',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

interface HelpDialogProps {
  open: boolean
  onClose: () => void
  onOpenSettings?: () => void
  onNavigate?: (target: Exclude<HelpNavTarget, 'settings'>) => void
}

function SectionBadge({ section, size = 40 }: { section: HelpSection; size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'primary.main',
        bgcolor: theme => (theme.palette.mode === 'dark' ? 'rgba(91,143,212,0.16)' : 'rgba(11,61,145,0.08)'),
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {section.icon}
    </Box>
  )
}

function FieldTable({ table }: { table: NonNullable<HelpTopic['table']> }) {
  return (
    <TableContainer sx={{ mt: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
      <Table size='small'>
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            {table.columns.map(column => (
              <TableCell key={column} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                {column}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {table.rows.map((row, rowIndex) => (
            <TableRow key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={`${cellIndex}-${cell}`}
                  sx={{ verticalAlign: 'top', fontWeight: cellIndex === 0 ? 600 : 400, whiteSpace: cellIndex === 0 ? 'nowrap' : 'normal' }}
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default function HelpDialog({ open, onClose, onOpenSettings, onNavigate }: HelpDialogProps) {
  const [activeId, setActiveId] = useState('getting-started')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const trimmedQuery = query.trim().toLowerCase()
  const isSearching = trimmedQuery.length > 0

  const filteredSections = useMemo(() => {
    if (!trimmedQuery) return []
    return helpSections
      .filter(section => section.id !== 'about')
      .map(section => {
        const sectionHit = `${section.title} ${section.summary}`.toLowerCase().includes(trimmedQuery)
        return {
          ...section,
          topics: sectionHit ? section.topics : section.topics.filter(topic => topicMatches(topic, trimmedQuery)),
        }
      })
      .filter(section => section.topics.length > 0)
  }, [trimmedQuery])

  const activeSection = helpSections.find(section => section.id === activeId) || helpSections[0]
  const hasResults = filteredSections.length > 0

  const handleLink = (link: HelpLink) => {
    if (link.target === 'settings') {
      onOpenSettings?.()
      return
    }
    onNavigate?.(link.target)
  }

  const renderTopic = (topic: HelpTopic) => (
    <Paper key={topic.id} variant='outlined' sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
      <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 0.5 }}>
        {topic.title}
      </Typography>
      {topic.body && (
        <Typography variant='body2' color='text.secondary' sx={{ lineHeight: 1.7 }}>
          {topic.body}
        </Typography>
      )}
      {topic.steps && (
        <Box component='ol' sx={{ pl: 2.5, my: 1.5 }}>
          {topic.steps.map((step, index) => (
            <Typography component='li' variant='body2' key={`${topic.id}-step-${index}`} sx={{ mb: 0.75, pl: 0.5, lineHeight: 1.65 }}>
              {step}
            </Typography>
          ))}
        </Box>
      )}
      {topic.bullets && (
        <Box component='ul' sx={{ pl: 2.5, my: 1.5 }}>
          {topic.bullets.map((bullet, index) => (
            <Typography component='li' variant='body2' key={`${topic.id}-bullet-${index}`} sx={{ mb: 0.75, pl: 0.5, lineHeight: 1.65 }}>
              {bullet}
            </Typography>
          ))}
        </Box>
      )}
      {topic.table && <FieldTable table={topic.table} />}
      {topic.code && (
        <Box
          component='pre'
          sx={{
            mt: 1.5,
            mb: 0,
            p: 1.5,
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover',
            overflowX: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          {topic.code}
        </Box>
      )}
      {topic.tip && (
        <Alert severity='info' sx={{ mt: 1.5 }}>
          <Typography variant='body2'>{topic.tip}</Typography>
        </Alert>
      )}
      {topic.warning && (
        <Alert severity='warning' sx={{ mt: 1.5 }}>
          <Typography variant='body2'>{topic.warning}</Typography>
        </Alert>
      )}
      {topic.links && topic.links.length > 0 && (
        <Stack direction='row' spacing={1} useFlexGap flexWrap='wrap' sx={{ mt: 1.5 }}>
          {topic.links.map(link => (
            <Button
              key={`${topic.id}-${link.label}`}
              size='small'
              variant='outlined'
              endIcon={<ArrowForwardIcon fontSize='small' />}
              onClick={() => handleLink(link)}
            >
              {link.label}
            </Button>
          ))}
        </Stack>
      )}
    </Paper>
  )

  const renderSectionHeader = (section: HelpSection, compact = false) => (
    <Stack direction='row' spacing={1.5} alignItems='center' sx={{ mb: compact ? 1.5 : 2.5 }}>
      <SectionBadge section={section} size={compact ? 32 : 44} />
      <Box>
        <Typography variant={compact ? 'subtitle1' : 'h5'} sx={{ fontWeight: 800, lineHeight: 1.2 }}>
          {section.title}
        </Typography>
        {!compact && (
          <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
            {section.summary}
          </Typography>
        )}
      </Box>
    </Stack>
  )

  const aboutPanel = (
    <Stack alignItems='center' sx={{ pt: 1, pb: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 600 }}>
        <BrandHeader title='Supersonic' showByMatrix />
      </Box>
      <Box sx={{ ...logoSurfaceSx, width: '100%', maxWidth: 360, mt: 4, px: 3, py: 3 }}>
        <Box
          component='img'
          src={MatrixKBLogo}
          alt='MatrixKB'
          sx={{ display: 'block', width: '100%', maxWidth: 260, maxHeight: 120, objectFit: 'contain' }}
        />
      </Box>
      <Typography variant='body2' color='text.secondary' sx={{ textAlign: 'center', mt: 2.5 }}>
        File Based Configuration editor for BMC Helix / PATROL Scripting KM
      </Typography>
      <Typography variant='body2' sx={{ mt: 1, fontWeight: 700 }}>
        Version {APP_VERSION}
      </Typography>
      <Divider sx={{ width: '100%', my: 4 }} />
      <Stack direction='row' spacing={2} alignItems='center' justifyContent='center' useFlexGap flexWrap='wrap'>
        <Box sx={{ ...logoSurfaceSx, px: 3, py: 2, minWidth: 160 }}>
          <Box component='img' src={MatrixLogo} alt='Matrix' sx={{ display: 'block', height: 40, maxWidth: 170, objectFit: 'contain' }} />
        </Box>
        <Box sx={{ ...logoSurfaceSx, px: 3, py: 2, minWidth: 200 }}>
          <Box component='img' src={BMCHelixLogo} alt='BMC Helix' sx={{ display: 'block', height: 40, maxWidth: 220, objectFit: 'contain' }} />
        </Box>
      </Stack>
      <Typography variant='caption' color='text.secondary' sx={{ mt: 4 }}>
        © {new Date().getFullYear()} Matrix. All rights reserved.
      </Typography>
    </Stack>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='lg'
      fullWidth
      PaperProps={{ sx: { height: { xs: '94vh', md: '84vh' }, maxHeight: 920, borderRadius: 3 } }}
    >
      <DialogTitle component='div' sx={{ pb: 2 }}>
        <Stack direction='row' spacing={1.5} alignItems='center'>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
              background: theme =>
                theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, rgba(91,143,212,0.28), rgba(206,147,216,0.18))'
                  : 'linear-gradient(135deg, #e8f0ff, #f4eaff)',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <MenuBookIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant='h6' sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              Help Center
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              Guides for every part of SUPERSONIC
            </Typography>
          </Box>
          <IconButton onClick={onClose} aria-label='Close help'>
            <CloseIcon />
          </IconButton>
        </Stack>
        <TextField
          fullWidth
          size='small'
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder='Search help: payload, host, dry run, backup…'
          aria-label='Search help'
          sx={{ mt: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon fontSize='small' />
              </InputAdornment>
            ),
          }}
        />
      </DialogTitle>

      <Box sx={{ display: { xs: 'block', md: 'none' }, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tabs
          value={isSearching ? false : activeId}
          onChange={(_, value: string) => {
            setActiveId(value)
            setQuery('')
          }}
          variant='scrollable'
          scrollButtons='auto'
          allowScrollButtonsMobile
        >
          {helpSections.map(section => (
            <Tab key={section.id} value={section.id} label={section.title} sx={{ textTransform: 'none', fontWeight: 600 }} />
          ))}
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0, display: 'flex', minHeight: 0 }}>
        <Box
          component='nav'
          aria-label='Help sections'
          sx={{
            width: 246,
            flexShrink: 0,
            display: { xs: 'none', md: 'block' },
            borderRight: '1px solid',
            borderColor: 'divider',
            overflowY: 'auto',
            bgcolor: theme => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'),
          }}
        >
          <List dense sx={{ py: 1 }}>
            {helpSections.map(section => {
              const selected = !isSearching && activeId === section.id
              return (
                <ListItemButton
                  key={section.id}
                  selected={selected}
                  onClick={() => {
                    setActiveId(section.id)
                    setQuery('')
                  }}
                  sx={{ mx: 1, my: 0.25, borderRadius: 1.5, '&.Mui-selected': { bgcolor: 'action.selected' } }}
                >
                  <ListItemIcon sx={{ minWidth: 34, color: selected ? 'primary.main' : 'text.secondary' }}>{section.icon}</ListItemIcon>
                  <ListItemText
                    primary={section.title}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: selected ? 700 : 500 }}
                  />
                </ListItemButton>
              )
            })}
          </List>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', p: { xs: 2, sm: 3 } }}>
          {isSearching ? (
            hasResults ? (
              <Box>
                <Typography variant='overline' color='text.secondary'>
                  Search results
                </Typography>
                <Typography variant='h6' sx={{ fontWeight: 800, mb: 2.5 }}>
                  Matches for “{query.trim()}”
                </Typography>
                <Stack spacing={3}>
                  {filteredSections.map(section => (
                    <Box key={section.id}>
                      {renderSectionHeader(section, true)}
                      <Stack spacing={1.5}>{section.topics.map(renderTopic)}</Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Paper variant='outlined' sx={{ p: 4, borderRadius: 2, textAlign: 'center' }}>
                <SearchOffIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
                <Typography variant='subtitle1' sx={{ fontWeight: 700, mt: 1 }}>
                  No help topics found
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5, mb: 2 }}>
                  Try a different word, or browse the sections on the left.
                </Typography>
                <Button variant='outlined' onClick={() => setQuery('')}>
                  Clear search
                </Button>
              </Paper>
            )
          ) : activeSection.id === 'about' ? (
            aboutPanel
          ) : (
            <Box>
              {renderSectionHeader(activeSection)}
              <Stack spacing={1.5}>{activeSection.topics.map(renderTopic)}</Stack>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Typography variant='caption' color='text.secondary' sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }}>
          Version {APP_VERSION} · {helpSections.length - 1} help sections
        </Typography>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
