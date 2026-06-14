// Placeholder route file. The tab button intercepts the press and routes to /add.
import { Redirect } from 'expo-router';

export default function AddTab() {
  return <Redirect href="/add" />;
}
