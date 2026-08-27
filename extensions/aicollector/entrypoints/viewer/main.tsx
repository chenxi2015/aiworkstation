import React from 'react';
import ReactDOM from 'react-dom/client';
import { ViewerApp } from './ViewerApp';
import '../sidepanel/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ViewerApp />
  </React.StrictMode>,
);
