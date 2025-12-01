import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// FIXED: Removed React.StrictMode to prevent double rendering in production
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)