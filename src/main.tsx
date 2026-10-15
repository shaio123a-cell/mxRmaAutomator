
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { CssBaseline, Container } from '@mui/material'
import './utils/fileApi'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import App from './pages/App'
import { aiSettingsReady, store } from './store/store'

const root = ReactDOM.createRoot(document.getElementById('root')!)

void aiSettingsReady.then(() => {
  root.render(
    <React.StrictMode>
      <Provider store={store}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <CssBaseline />
          <Container maxWidth='xl'>
            <App />
          </Container>
        </LocalizationProvider>
      </Provider>
    </React.StrictMode>,
  )
})
