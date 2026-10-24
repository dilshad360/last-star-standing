import { useEffect, useState } from 'react';

const isLoopback = (host: string) =>
  host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/**
 * URL the QR code encodes. In production this is the page origin; on a
 * dev machine opened via localhost, phones can't reach "localhost", so we
 * ask the dev server for the machine's LAN addresses instead.
 */
export function useShareUrl(code: string): {
  url: string;
  hosts: string[];
  selectedHost: string;
  selectHost: (host: string) => void;
  unreachable: boolean;
} {
  const { protocol, hostname, port } = window.location;
  const [hosts, setHosts] = useState<string[]>([hostname]);
  const [selectedHost, setSelectedHost] = useState(hostname);

  useEffect(() => {
    if (!isLoopback(hostname)) return;
    let cancelled = false;
    fetch('/api/network')
      .then((res) => res.json())
      .then((data: { ips?: Array<{ ip: string }> }) => {
        const ips = (data.ips ?? []).map((entry) => entry.ip);
        if (cancelled || ips.length === 0) return;
        setHosts(ips);
        setSelectedHost(ips.find((ip) => ip.startsWith('192.168.') || ip.startsWith('10.')) ?? ips[0]!);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hostname]);

  const portPart = port ? `:${port}` : '';
  return {
    url: `${protocol}//${selectedHost}${portPart}/play?room=${code}`,
    hosts,
    selectedHost,
    selectHost: setSelectedHost,
    unreachable: isLoopback(selectedHost),
  };
}
