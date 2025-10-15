
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-privy-authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const buildPreflightHeaders = (req: Request) => {
  const requested = req.headers.get('Access-Control-Request-Headers');
  // Echo requested headers if present to satisfy strict browsers
  const allowHeaders = requested?.length
    ? requested
    : corsHeaders['Access-Control-Allow-Headers'];
  return {
    ...corsHeaders,
    'Access-Control-Allow-Headers': allowHeaders,
  } as Record<string, string>;
};
