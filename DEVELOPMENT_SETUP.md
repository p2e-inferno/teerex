# Development Setup Guide

This guide will help you set up the project for local development and contributions.

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Configure required environment variables**
   
   Edit the `.env` file and set the following required variables:

   ### Required for Basic Development
   ```env
   VITE_SUPABASE_URL=your_supabase_url_here
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   VITE_PRIVY_APP_ID=your_privy_app_id_here
   ```

   ### How to get these values:

   **Supabase Configuration:**
   - Visit [Supabase Dashboard](https://supabase.com/dashboard)
   - Create a new project or use existing one
   - Go to Settings > API
   - Copy the `URL` and `anon key`

   **Privy Configuration:**
   - Visit [Privy Dashboard](https://dashboard.privy.io)
   - Create a new app or use existing one
   - Copy your App ID from the dashboard

5. **Start the development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:8080`

## Development Environment Variables

### Client-Side Variables (VITE_)
These variables are exposed to the browser and should NOT contain sensitive information:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (safe for client-side)
- `VITE_PRIVY_APP_ID` - Privy application ID

### Server-Side Variables (Edge Functions)
These are only needed when testing edge functions locally or for production features:

- `SUPABASE_SERVICE_ROLE_KEY` - For edge functions (keep secret!)
- `PAYSTACK_SECRET_KEY` - For payment processing (keep secret!)
- `UNLOCK_SERVICE_PRIVATE_KEY` - For smart contract interactions (keep secret!)
- `PRIVY_APP_SECRET` - Privy app secret (keep secret!)

## Testing Different Features

### Basic Features (No additional setup needed)
- Browse events
- View event details
- User interface and navigation

### Authentication Features
- Requires: `VITE_PRIVY_APP_ID`
- Features: Login, wallet connection, user profiles

### Event Creation & Management
- Requires: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PRIVY_APP_ID`
- Features: Create events, manage drafts, view my events

### Payment Testing
- Requires: All variables including `PAYSTACK_SECRET_KEY`
- Features: Purchase tickets, payment processing

### Smart Contract Interactions
- Requires: `UNLOCK_SERVICE_PRIVATE_KEY`
- Features: NFT ticket granting, attestations

## Security Best Practices

1. **Never commit sensitive keys**
   - The `.env` file is in `.gitignore`
   - Only commit `.env.example` with placeholder values

2. **Use different keys for development and production**
   - Use test keys for development
   - Keep production keys secure and separate

3. **Rotate keys regularly**
   - Especially if they might have been exposed

## Contributing

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add tests if applicable
   - Update documentation if needed

3. **Test your changes**
   - Ensure the app runs without errors
   - Test the specific feature you're working on

4. **Submit a pull request**
   - Provide a clear description of your changes
   - Reference any related issues

## Common Issues

### "Environment variable not found" errors
- Make sure you've copied `.env.example` to `.env`
- Check that all required variables are set
- Restart the development server after changing `.env`

### Authentication not working
- Verify your `VITE_PRIVY_APP_ID` is correct
- Check the Privy dashboard for any configuration issues

### Database connection issues
- Verify your Supabase URL and anon key
- Check if your Supabase project is active

### Payment features not working
- Payment features require additional secret keys
- Contact maintainers for test keys if needed

## Project Structure

```
src/
├── components/          # Reusable UI components
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── integrations/       # External service integrations
└── types/              # TypeScript type definitions

supabase/
├── functions/          # Edge functions
└── migrations/         # Database migrations
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Getting Help

- Check the [Production Readiness Guide](./PRODUCTION_READINESS_GUIDE.md) for detailed project information
- Open an issue for bugs or feature requests
- Contact maintainers for access to test credentials

## Environment Variable Reference

| Variable | Required | Purpose | Where to get it |
|----------|----------|---------|-----------------|
| `VITE_SUPABASE_URL` | Yes | Database connection | Supabase Dashboard > Settings > API |
| `VITE_SUPABASE_ANON_KEY` | Yes | Database auth | Supabase Dashboard > Settings > API |
| `VITE_PRIVY_APP_ID` | Yes | User authentication | Privy Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | No* | Edge functions | Supabase Dashboard > Settings > API |
| `PAYSTACK_SECRET_KEY` | No* | Payment processing | Paystack Dashboard |
| `UNLOCK_SERVICE_PRIVATE_KEY` | No* | Smart contracts | Generated/provided |
| `PRIVY_APP_SECRET` | No* | Auth verification | Privy Dashboard |

*Required for specific features or production deployment