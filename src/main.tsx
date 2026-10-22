import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('未找到应用挂载点 #root');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);