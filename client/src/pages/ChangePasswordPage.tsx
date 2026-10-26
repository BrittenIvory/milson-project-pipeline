import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBanner, Field, PageHeader, TextInput } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage, authApi } from '../lib/api';

/** Forced or voluntary password change. Clears must_change_password on success. */
export default function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      await refresh();
      setDone(true);
      if (user?.mustChangePassword) navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to change password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={user?.mustChangePassword ? 'Set a new password' : 'Change password'}
        description={
          user?.mustChangePassword
            ? 'Your administrator reset your password. Choose a new one to continue.'
            : 'Update the password for your account.'
        }
      />
      <Card className="p-4">
        {done && !user?.mustChangePassword ? (
          <p className="text-sm text-emerald-700">Password updated.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <ErrorBanner message={error} />
            <Field label="Current password">
              <TextInput
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <TextInput
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <TextInput
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              Save new password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
