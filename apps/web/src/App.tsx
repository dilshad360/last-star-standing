import { HostApp } from './host/HostApp.js';
import { ControllerApp } from './controller/ControllerApp.js';
import './styles/index.css';

/** `/play?room=CODE` (what the QR code opens) is the phone controller; everything else is the host screen. */
export default function App() {
  const isController = window.location.pathname.startsWith('/play');
  return isController ? <ControllerApp /> : <HostApp />;
}
