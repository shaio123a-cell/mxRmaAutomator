
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import './utils/fileApi'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import App from './pages/App'
import { aiSettingsReady, store } from './store/store'
import { AppThemeProvider } from './theme'

const root = ReactDOM.createRoot(document.getElementById('root')!)

void aiSettingsReady.then(() => {
  root.render(
    <React.StrictMode>
      <Provider store={store}>
        <AppThemeProvider>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <App />
          </LocalizationProvider>
        </AppThemeProvider>
      </Provider>
    </React.StrictMode>,
  )
})
