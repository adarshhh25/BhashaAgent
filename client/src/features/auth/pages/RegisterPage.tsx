import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { RegisterForm } from '../components/RegisterForm';
import { useAuth } from '../hooks/useAuth';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <AuthLayout
      title="Create account"
      subtitle="Sign up for BhashaAgent multilingual assistant"
    >
      <RegisterForm
        onNavigateToLogin={() => navigate('/login')}
      />
    </AuthLayout>
  );
}
