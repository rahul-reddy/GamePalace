import { useEffect } from 'react';
import { navigate, usePath } from './lib/router';
import { Entry } from './screens/Entry';
import { Landing } from './screens/Landing';
import { RoomScreen } from './screens/Room';
import { Unsupported, supported } from './screens/Unsupported';

export function App() {
  const path = usePath();
  useEffect(() => {
    document.documentElement.lang = 'en';
  }, []);
  if (!supported()) return <Unsupported />;
  const room = /^\/room\/([A-Za-z0-9]{6})\/?$/.exec(path);
  if (room) return <RoomScreen code={(room[1] as string).toUpperCase()} />;
  const join = /^\/join(?:\/([A-Za-z0-9]{0,6}))?\/?$/.exec(path);
  if (join) return <Entry mode="join" initialCode={(join[1] ?? '').toUpperCase()} />;
  if (path === '/host') return <Entry mode="host" initialCode="" />;
  if (path !== '/') {
    navigate('/', true);
    return null;
  }
  return <Landing />;
}
