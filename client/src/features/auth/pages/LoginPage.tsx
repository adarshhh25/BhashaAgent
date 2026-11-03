import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { LoginForm } from '../components/LoginForm';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Enter your credentials to access your assistant"
    >
      <LoginForm
        onNavigateToRegister={() => navigate('/register')}
        onSuccess={() => navigate('/', { replace: true })}
      />
    </AuthLayout>
  );
}
