import { useEffect, useState } from 'react';
import { fetchMe } from './api';

/* Server-side identity comes from the Cloudflare Access JWT,
 * verified in the Worker. The frontend never decides access itself:
 * write APIs return 401 without a valid Access session. */
export function useAuth() {
  const [state, setState] = useState({ loading: true, email: null, accessConfigured: false, local: false });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) =>
        !cancelled &&
        setState({
          loading: false,
          email: me.email || null,
          accessConfigured: !!me.access_configured,
          local: !!me.local,
        })
      )
      .catch(() => !cancelled && setState({ loading: false, email: null, accessConfigured: false, local: true }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
