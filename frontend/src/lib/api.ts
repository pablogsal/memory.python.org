import type {
  Binary,
  Commit,
  DiffTableRow,
  Environment,
  PythonVersionFilterOption,
  BenchmarkResultJson,
  AuthToken,
  TokenCreate,
  TokenUpdate,
  TokenAnalytics,
} from './types';
import type {
  ApiResponse,
  ErrorResponse,
  TrendDataPoint,
  EnvironmentSummary,
  CommitSummary,
  BatchTrendsResponse,
  UploadResponse,
  TrendQueryParams,
  BenchmarkNamesQueryParams,
  DiffQueryParams,
  UploadRequestData,
} from '../types/api';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Network error handler
class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      credentials: 'include', // Include cookies for authentication
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `API error: ${response.statusText}`;

      // Try to get more detailed error message from response
      try {
        const errorData: ErrorResponse = await response.json();
        if (errorData.detail) {
          errorMessage =
            typeof errorData.detail === 'string'
              ? errorData.detail
              : errorData.detail.message || errorMessage;
        }
      } catch {
        // If response isn't JSON, fall back to status text
      }

      throw new ApiError(response.status, errorMessage, response);
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new NetworkError(
        'Network connection failed. Please check your internet connection.'
      );
    }

    // Handle timeout
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError('Request timed out. Please try again.');
    }

    // Re-throw other errors
    throw error;
  }
}

// Utility functions for response handling
function wrapApiResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    data,
    message,
    status: 200,
  };
}

// Helper for creating typed query parameters
function createQueryParams(params: Record<string, any>): URLSearchParams {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, value.toString());
    }
  });
  return queryParams;
}

export const api = {
  // Commit endpoints
  getCommits: (skip: number = 0, limit: number = 100) =>
    fetchApi<Commit[]>(`/commits?skip=${skip}&limit=${limit}`),
  getCommit: (sha: string) => fetchApi<Commit>(`/commits/${sha}`),

  // Binary endpoints
  getBinaries: () => fetchApi<Binary[]>(`/binaries?_t=${Date.now()}`),
  getBinary: (id: string) => fetchApi<Binary>(`/binaries/${id}`),
  getEnvironmentsForBinary: (binaryId: string) =>
    fetchApi<EnvironmentSummary[]>(`/binaries/${binaryId}/environments`),
  getCommitsForBinaryAndEnvironment: (
    binaryId: string,
    environmentId: string
  ) =>
    fetchApi<CommitSummary[]>(
      `/binaries/${binaryId}/environments/${environmentId}/commits`
    ),

  // Environment endpoints
  getEnvironments: () => fetchApi<Environment[]>('/environments'),
  getEnvironment: (id: string) => fetchApi<Environment>(`/environments/${id}`),

  // Python version endpoints
  getPythonVersions: () =>
    fetchApi<PythonVersionFilterOption[]>('/python-versions'),

  // Benchmark endpoints
  getAllBenchmarks: () => fetchApi<string[]>('/benchmarks'),
  getBenchmarkNames: (params: BenchmarkNamesQueryParams) => {
    const queryParams = createQueryParams(params);
    return fetchApi<string[]>(`/benchmark-names?${queryParams.toString()}`);
  },

  // Diff endpoint
  getDiffTable: (params: DiffQueryParams) => {
    const queryParams = createQueryParams(params);
    return fetchApi<DiffTableRow[]>(`/diff?${queryParams.toString()}`);
  },

  // Upload endpoint
  uploadBenchmarkResults: (data: UploadRequestData) =>
    fetchApi<UploadResponse>('/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Optimized trends endpoint
  getBenchmarkTrends: (params: TrendQueryParams) => {
    const queryParams = createQueryParams(params);
    return fetchApi<TrendDataPoint[]>(`/trends?${queryParams.toString()}`);
  },

  // Batch trends endpoint
  getBatchBenchmarkTrends: (trendQueries: TrendQueryParams[]) => {
    return fetchApi<BatchTrendsResponse>('/trends-batch', {
      method: 'POST',
      body: JSON.stringify({
        trend_queries: trendQueries.map((query) => ({
          ...query,
          limit: query.limit || 50,
        })),
      }),
    });
  },

  // Flamegraph endpoint
  getFlamegraph: (id: string) =>
    fetchApi<{ flamegraph_html: string }>(`/flamegraph/${id}`),

  // Token management endpoints
  getTokens: () =>
    fetchApi<AuthToken[]>('/admin/tokens', {
      credentials: 'include',
    }),

  createToken: (tokenData: TokenCreate) =>
    fetchApi<{ success: boolean; token: string; token_info: AuthToken }>(
      '/admin/tokens',
      {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(tokenData),
      }
    ),

  updateToken: (tokenId: number, tokenUpdate: TokenUpdate) =>
    fetchApi<AuthToken>(`/admin/tokens/${tokenId}`, {
      method: 'PUT',
      credentials: 'include',
      body: JSON.stringify(tokenUpdate),
    }),

  deactivateToken: (tokenId: number) =>
    fetchApi<{ success: boolean }>(`/admin/tokens/${tokenId}/deactivate`, {
      method: 'POST',
      credentials: 'include',
    }),

  activateToken: (tokenId: number) =>
    fetchApi<{ success: boolean }>(`/admin/tokens/${tokenId}/activate`, {
      method: 'POST',
      credentials: 'include',
    }),

  deleteToken: (tokenId: number) =>
    fetchApi<{ success: boolean }>(`/admin/tokens/${tokenId}`, {
      method: 'DELETE',
      credentials: 'include',
    }),

  getTokenAnalytics: () =>
    fetchApi<TokenAnalytics>('/admin/tokens/analytics', {
      credentials: 'include',
    }),

  // Admin user endpoints
  getAdminUsers: () =>
    fetchApi<
      Array<{
        id: number;
        github_username: string;
        added_by: string;
        added_at: string;
        is_active: boolean;
        notes?: string;
      }>
    >('/admin/users', {
      credentials: 'include',
    }),

  // Public endpoints
  getMaintainers: () =>
    fetchApi<
      Array<{
        id: number;
        github_username: string;
        added_by: string;
        added_at: string;
        is_active: boolean;
      }>
    >('/maintainers'),
};

export default api;
export { ApiError };
