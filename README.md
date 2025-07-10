# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/8fbc8974-ce33-4345-b60d-323e420a15bc

## Quick Start

For detailed setup instructions, see [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md).

### Basic Setup

1. **Clone and install**
   ```sh
   git clone <YOUR_GIT_URL>
   cd <YOUR_PROJECT_NAME>
   npm install
   ```

2. **Set up environment variables**
   ```sh
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development server**
   ```sh
   npm run dev
   ```

### Required Environment Variables

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key  
- `VITE_PRIVY_APP_ID` - Your Privy app ID

See [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md) for detailed configuration instructions.

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/8fbc8974-ce33-4345-b60d-323e420a15bc) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

See [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md) for complete setup instructions.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/8fbc8974-ce33-4345-b60d-323e420a15bc) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
