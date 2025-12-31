import React from 'react'
import { Box, Button, Typography } from '@mui/material'

export default class ErrorBoundary extends React.Component<any, { hasError: boolean, error?: any, info?: any }> {
  constructor(props: any){
    super(props)
    this.state = { hasError: false }
  }

  componentDidCatch(error: any, info: any){
    console.error('ErrorBoundary caught', error, info)
    this.setState({ hasError: true, error, info })
  }

  render(){
    if (this.state.hasError){
      return (
        <Box sx={{p:3}}>
          <Typography variant='h5' color='error'>Something went wrong</Typography>
          <Typography variant='body2' sx={{whiteSpace:'pre-wrap', mt:2}}>{String(this.state.error?.toString?.() || 'Unknown error')}</Typography>
          <Button sx={{mt:2}} variant='contained' onClick={()=>window.location.reload()}>Reload</Button>
        </Box>
      )
    }
    return this.props.children
  }
}
