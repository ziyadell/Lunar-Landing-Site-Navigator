import './utils/perf';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/experience.css';
import './styles/stage.css';
import './styles/study.css';
import './styles/refine.css';
import './styles/polish.css';
import './styles/final.css';
import './styles/mobile.css';
import './styles/panels.css';
import './styles/start.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
