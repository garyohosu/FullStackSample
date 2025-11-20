import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { hashPassword, verifyPassword } from './lib/password';
import {
  createSession,
  validateSession,
  invalidateSession,
  setSessionCookie,
  deleteSessionCookie,
  getSessionIdFromCookie,
  generateUserId,
} from './lib/session';
import { validateRegistration } from './lib/validation';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for API routes
app.use('/api/*', cors());

/**
 * POST /api/register
 * Register a new user with email and password
 */
app.post('/api/register', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();

    // Validate input
    const validation = validateRegistration(email, password);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 400);
    }

    // Check if user already exists
    const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first();

    if (existingUser) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    // Hash password - wrap in try-catch to catch specific errors
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password);
    } catch (hashError) {
      const hashErrorMsg = hashError instanceof Error ? hashError.message : 'Unknown hash error';
      return c.json({ error: 'Password hashing failed', details: hashErrorMsg }, 500);
    }

    // Create user
    const userId = generateUserId();
    const createdAt = Date.now();

    await c.env.DB.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, email.toLowerCase(), passwordHash, createdAt)
      .run();

    // Create session
    const session = await createSession(c.env.DB, userId);

    // Set cookie
    setSessionCookie(c, session.id, session.expiresAt);

    return c.json({ success: true, userId });
  } catch (error) {
    console.error('Registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return c.json({ 
      error: 'Internal server error', 
      details: errorMessage,
      stack: errorStack 
    }, 500);
  }
});

/**
 * POST /api/login
 * Login with email and password
 */
app.post('/api/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // Find user
    const user = await c.env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first<{ id: string; email: string; password_hash: string }>();

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Verify password
    const isValidPassword = await verifyPassword(user.password_hash, password);
    if (!isValidPassword) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Create session
    const session = await createSession(c.env.DB, user.id);

    // Set cookie
    setSessionCookie(c, session.id, session.expiresAt);

    return c.json({ success: true, userId: user.id });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/logout
 * Logout and invalidate session
 */
app.post('/api/logout', async (c) => {
  try {
    const sessionId = getSessionIdFromCookie(c);

    if (sessionId) {
      await invalidateSession(c.env.DB, sessionId);
    }

    deleteSessionCookie(c);

    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/user
 * Get current user information (protected route)
 */
app.get('/api/user', async (c) => {
  try {
    const sessionId = getSessionIdFromCookie(c);

    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionData = await validateSession(c.env.DB, sessionId);

    if (!sessionData) {
      deleteSessionCookie(c);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return c.json({
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
      },
    });
  } catch (error) {
    console.error('User fetch error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /protected
 * Protected page - requires authentication
 */
app.get('/protected', async (c) => {
  const sessionId = getSessionIdFromCookie(c);

  if (!sessionId) {
    return c.redirect('/');
  }

  const sessionData = await validateSession(c.env.DB, sessionId);

  if (!sessionData) {
    deleteSessionCookie(c);
    return c.redirect('/');
  }

  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Protected Page - FullStackSample</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8">
            <div class="text-center mb-6">
                <h1 class="text-3xl font-bold text-gray-800 mb-2">Protected Page</h1>
                <p class="text-gray-600">ログイン成功！</p>
            </div>

            <div class="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
                <p class="text-sm text-gray-700">
                    <span class="font-semibold">Email:</span> ${sessionData.user.email}
                </p>
                <p class="text-sm text-gray-700 mt-2">
                    <span class="font-semibold">User ID:</span> ${sessionData.user.id}
                </p>
            </div>

            <button
                id="logoutBtn"
                class="w-full bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 transition-colors"
            >
                ログアウト
            </button>
        </div>

        <script>
            document.getElementById('logoutBtn').addEventListener('click', async () => {
                try {
                    const response = await fetch('/api/logout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (response.ok) {
                        window.location.href = '/';
                    }
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('ログアウトに失敗しました');
                }
            });
        </script>
    </body>
    </html>
  `);
});

/**
 * GET /register
 * Registration page
 */
app.get('/register', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Register - FullStackSample</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8">
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">新規登録</h1>

            <form id="registerForm" class="space-y-4">
                <div>
                    <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
                        メールアドレス
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="your@email.com"
                    />
                </div>

                <div>
                    <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
                        パスワード（8文字以上）
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        required
                        minlength="8"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="••••••••"
                    />
                </div>

                <div id="errorMessage" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm"></div>

                <button
                    type="submit"
                    class="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition-colors font-medium"
                >
                    登録
                </button>
            </form>

            <div class="mt-4 text-center">
                <a href="/" class="text-sm text-blue-500 hover:text-blue-600">
                    ログインページに戻る
                </a>
            </div>
        </div>

        <script>
            const form = document.getElementById('registerForm');
            const errorMessage = document.getElementById('errorMessage');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                errorMessage.classList.add('hidden');

                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                try {
                    const response = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        window.location.href = '/protected';
                    } else {
                        errorMessage.textContent = data.error || '登録に失敗しました';
                        errorMessage.classList.remove('hidden');
                    }
                } catch (error) {
                    console.error('Registration error:', error);
                    errorMessage.textContent = 'サーバーエラーが発生しました';
                    errorMessage.classList.remove('hidden');
                }
            });
        </script>
    </body>
    </html>
  `);
});

/**
 * GET /
 * Login page (home)
 */
app.get('/', async (c) => {
  // Check if already logged in
  const sessionId = getSessionIdFromCookie(c);
  if (sessionId) {
    const sessionData = await validateSession(c.env.DB, sessionId);
    if (sessionData) {
      return c.redirect('/protected');
    }
  }

  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - FullStackSample</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8">
            <h1 class="text-3xl font-bold text-center text-gray-800 mb-6">ログイン</h1>

            <form id="loginForm" class="space-y-4">
                <div>
                    <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
                        メールアドレス
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="your@email.com"
                    />
                </div>

                <div>
                    <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
                        パスワード
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        required
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="••••••••"
                    />
                </div>

                <div id="errorMessage" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm"></div>

                <button
                    type="submit"
                    class="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition-colors font-medium"
                >
                    ログイン
                </button>
            </form>

            <div class="mt-4 text-center">
                <a href="/register" class="text-sm text-blue-500 hover:text-blue-600">
                    アカウントを作成する
                </a>
            </div>
        </div>

        <script>
            const form = document.getElementById('loginForm');
            const errorMessage = document.getElementById('errorMessage');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                errorMessage.classList.add('hidden');

                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await response.json();

                    if (response.ok) {
                        window.location.href = '/protected';
                    } else {
                        errorMessage.textContent = data.error || 'ログインに失敗しました';
                        errorMessage.classList.remove('hidden');
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    errorMessage.textContent = 'サーバーエラーが発生しました';
                    errorMessage.classList.remove('hidden');
                }
            });
        </script>
    </body>
    </html>
  `);
});

export default app;
