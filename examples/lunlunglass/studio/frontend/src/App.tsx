import { BrowserRouter as Router } from 'react-router-dom'
import Layout from '@/layouts/Layout'
import { AppRoutes } from '@/routes'
import './App.css'

function App() {
  return (
    <Router>
      <Layout>
        <AppRoutes />
      </Layout>
    </Router>
  )
}

export default App
