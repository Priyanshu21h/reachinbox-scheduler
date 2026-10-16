import { useQuery } from '@tanstack/react-query';
import { getMe } from '../lib/api';

export function useAuth() {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !isError,
  };
}
