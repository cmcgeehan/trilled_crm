'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

function VerifyInviteContent() {
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  useEffect(() => {
    const verifyInvite = async () => {
      try {
        const token = searchParams?.get('token') || '';
        const type = searchParams?.get('type') || '';

        console.log('Verifying token:', { token, type });

        if (!token) {
          throw new Error('No token provided');
        }

        // Verify the invite token
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'invite',
        });

        if (verifyError) {
          throw verifyError;
        }

        setShowPasswordForm(true);
        setLoading(false);
      } catch (error) {
        console.error('Error verifying invite:', error);
        toast.error('Invalid or expired invite link. Please request a new invite.');
        router.push('/login');
      }
    };

    verifyInvite();
  }, [searchParams, router, supabase.auth]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      toast.success('Password set successfully! Redirecting to dashboard...');
      router.push('/');
    } catch (error) {
      console.error('Error setting password:', error);
      toast.error('Error setting password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !showPasswordForm) {
    return (
      <div className="container flex items-center justify-center min-h-screen py-12">
        <p>Verifying invite...</p>
      </div>
    );
  }

  return (
    <div className="container flex items-center justify-center min-h-screen py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set Your Password</CardTitle>
          <CardDescription>
            Please set a password to complete your account setup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Setting password...' : 'Set Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyInvite() {
  return (
    <Suspense fallback={
      <div className="container flex items-center justify-center min-h-screen py-12">
        <p>Loading...</p>
      </div>
    }>
      <VerifyInviteContent />
    </Suspense>
  );
} 