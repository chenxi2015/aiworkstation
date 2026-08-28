import React from 'react';
import ReactDOM from 'react-dom/client';
import { DocViewerApp } from './DocViewerApp';
import '../sidepanel/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DocViewerApp />
  </React.StrictMode>,
);
