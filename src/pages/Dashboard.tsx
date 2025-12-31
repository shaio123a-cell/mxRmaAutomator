
import React from 'react'
import { useAppSelector } from '../store/store'
import { Card, CardContent, Grid, Typography } from '@mui/material'

export default function Dashboard(){
  const devices = useAppSelector(s => s.fbcskm.devices)
  return (
    <Grid container spacing={2}>
      {devices.map(d => (
        <Grid item key={d.id} xs={12} md={6} lg={4}>
          <Card>
            <CardContent>
              <Typography variant='h6'>{d.name}</Typography>
              <Typography variant='body2'>Scripts: {d.scripts.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
      {devices.length === 0 && (
        <Grid item xs={12}><Typography color='text.secondary'>No devices parsed yet.</Typography></Grid>
      )}
    </Grid>
  )
}
