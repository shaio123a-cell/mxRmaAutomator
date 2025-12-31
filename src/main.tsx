
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { CssBaseline, Container } from '@mui/material'
import './utils/fileApi'
import App from './pages/App'
import { store } from './store/store'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <CssBaseline />
      <Container maxWidth='xl'>
        <App />
      </Container>
    </Provider>
  </React.StrictMode>
)
