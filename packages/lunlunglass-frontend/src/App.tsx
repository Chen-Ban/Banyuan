import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './layouts/Layout'
import TemplatePage from "./pages/TemplatePage"
import './App.css'

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/template" element={<TemplatePage />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App