import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { DIVVI_CONSUMER_ADDRESS } from '../_shared/constants.ts';

/**
 * Divvi SDK Debug Test Function
 *
 * Purpose: Isolate and diagnose Divvi SDK loading and tag generation issues in Deno runtime
 *
 * Usage:
 *   curl -X POST https://your-project.supabase.co/functions/v1/divvi-debug-test \
 *     -H "Authorization: Bearer anon-key" \
 *     -H "Content-Type: application/json" \
 *     -d '{"testUser": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}'
 */

type ReferralSdk = {
  getReferralTag: (args: { user: `0x${string}`; consumer: `0x${string}` }) => string;
  submitReferral: (args: { txHash: string; chainId: number }) => Promise<unknown>;
};

const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);
const isHex = (hex: unknown): hex is string => typeof hex === 'string' && /^0x[0-9a-fA-F]*$/.test(hex);

interface DebugResult {
  step: string;
  status: 'success' | 'error' | 'warning';
  data?: any;
  message?: string;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const results: DebugResult[] = [];
  const log = (step: string, status: 'success' | 'error' | 'warning', data?: any, message?: string) => {
    const result: DebugResult = {
      step,
      status,
      data,
      message,
      timestamp: new Date().toISOString(),
    };
    results.push(result);
    console.log(`[divvi-debug] ${step}:`, { status, data, message });
  };

  try {
    // Step 1: Check environment configuration
    log('env_check', DIVVI_CONSUMER_ADDRESS ? 'success' : 'error', {
      consumer_address: DIVVI_CONSUMER_ADDRESS,
      consumer_length: DIVVI_CONSUMER_ADDRESS?.length,
      is_valid_format: /^0x[a-fA-F0-9]{40}$/.test(DIVVI_CONSUMER_ADDRESS || ''),
    }, DIVVI_CONSUMER_ADDRESS ? 'Consumer address configured' : 'DIVVI_CONSUMER_ADDRESS not set');

    // Step 2: Parse request
    const body = await req.json().catch(() => ({}));
    const testUser = body.testUser || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
    log('request_parsed', 'success', { testUser });

    // Step 3: Test SDK loading via npm: protocol
    log('sdk_load_npm_start', 'success', {}, 'Attempting npm: import');
    let sdkFromNpm: any = null;
    let npmError: any = null;
    try {
      sdkFromNpm = await import('npm:@divvi/referral-sdk@2.3.0');
      log('sdk_load_npm', 'success', {
        has_getReferralTag: typeof sdkFromNpm?.getReferralTag === 'function',
        has_submitReferral: typeof sdkFromNpm?.submitReferral === 'function',
        keys: Object.keys(sdkFromNpm || {}),
        getReferralTag_type: typeof sdkFromNpm?.getReferralTag,
        submitReferral_type: typeof sdkFromNpm?.submitReferral,
      }, 'npm: import successful');
    } catch (error) {
      npmError = error;
      log('sdk_load_npm', 'error', {
        error_message: (error as Error)?.message,
        error_name: (error as Error)?.name,
        error_stack: (error as Error)?.stack?.split('\n').slice(0, 5),
      }, 'npm: import failed');
    }

    // Step 4: Test SDK loading via esm.sh
    log('sdk_load_esm_start', 'success', {}, 'Attempting esm.sh import');
    let sdkFromEsm: any = null;
    let esmError: any = null;
    try {
      sdkFromEsm = await import('https://esm.sh/@divvi/referral-sdk@2.3.0?target=deno');
      log('sdk_load_esm', 'success', {
        has_getReferralTag: typeof sdkFromEsm?.getReferralTag === 'function',
        has_submitReferral: typeof sdkFromEsm?.submitReferral === 'function',
        keys: Object.keys(sdkFromEsm || {}),
        getReferralTag_type: typeof sdkFromEsm?.getReferralTag,
        submitReferral_type: typeof sdkFromEsm?.submitReferral,
      }, 'esm.sh import successful');
    } catch (error) {
      esmError = error;
      log('sdk_load_esm', 'error', {
        error_message: (error as Error)?.message,
        error_name: (error as Error)?.name,
        error_stack: (error as Error)?.stack?.split('\n').slice(0, 5),
      }, 'esm.sh import failed');
    }

    // Step 5: Determine which SDK to use
    const sdk = sdkFromNpm || sdkFromEsm;
    if (!sdk) {
      log('sdk_selection', 'error', {}, 'Both SDK imports failed');
      throw new Error('Failed to load Divvi SDK from any source');
    }

    const sdkSource = sdkFromNpm ? 'npm' : 'esm.sh';
    log('sdk_selection', 'success', { source: sdkSource }, `Using SDK from ${sdkSource}`);

    // Step 6: Validate SDK functions
    const hasGetReferralTag = typeof sdk.getReferralTag === 'function';
    const hasSubmitReferral = typeof sdk.submitReferral === 'function';

    log('sdk_validation', hasGetReferralTag && hasSubmitReferral ? 'success' : 'error', {
      has_getReferralTag: hasGetReferralTag,
      has_submitReferral: hasSubmitReferral,
      getReferralTag_toString: hasGetReferralTag ? sdk.getReferralTag.toString().slice(0, 200) : null,
    }, hasGetReferralTag && hasSubmitReferral
      ? 'SDK has required functions'
      : 'SDK missing required functions');

    if (!hasGetReferralTag) {
      throw new Error('SDK missing getReferralTag function');
    }

    // Step 7: Generate referral tag
    log('tag_generation_start', 'success', {
      user: testUser,
      consumer: DIVVI_CONSUMER_ADDRESS,
    }, 'Generating referral tag');

    let tag: string;
    try {
      tag = sdk.getReferralTag({
        user: testUser as `0x${string}`,
        consumer: DIVVI_CONSUMER_ADDRESS as `0x${string}`,
      });

      log('tag_generation', 'success', {
        tag,
        tag_length_chars: tag.length,
        tag_length_bytes: strip0x(tag).length / 2,
        is_hex: isHex(tag),
        is_even_length: strip0x(tag).length % 2 === 0,
        first_10_chars: tag.slice(0, 10),
        last_10_chars: tag.slice(-10),
      }, 'Tag generated successfully');
    } catch (error) {
      log('tag_generation', 'error', {
        error_message: (error as Error)?.message,
        error_name: (error as Error)?.name,
        error_stack: (error as Error)?.stack,
      }, 'Tag generation failed');
      throw error;
    }

    // Step 8: Analyze tag structure
    const tagHex = strip0x(tag);
    const tagBytes = tagHex.length / 2;
    const last4Bytes = tagHex.slice(-8); // Last 4 bytes in hex (8 chars)
    const encodedLength = parseInt(last4Bytes, 16);

    log('tag_analysis', 'success', {
      tag_full: tag,
      tag_hex_length: tagHex.length,
      tag_byte_length: tagBytes,
      last_4_bytes_hex: last4Bytes,
      encoded_length_value: encodedLength,
      length_mismatch: encodedLength > tagBytes,
      is_valid: encodedLength <= tagBytes && isHex(tag) && tagHex.length % 2 === 0,
    }, `Tag analysis: ${encodedLength > tagBytes ? 'INVALID - Length mismatch detected!' : 'Valid'}`);

    // Step 9: Test calldata appending
    const sampleCalldata = '0x1234567890abcdef';
    const taggedCalldata = sampleCalldata + strip0x(tag);

    log('calldata_append', 'success', {
      original_calldata: sampleCalldata,
      original_length: sampleCalldata.length,
      tag: tag,
      tagged_calldata: taggedCalldata,
      tagged_length: taggedCalldata.length,
      length_increase: taggedCalldata.length - sampleCalldata.length,
    }, 'Calldata append test');

    // Step 10: Test multiple tag generations (check for consistency)
    const tags = [];
    for (let i = 0; i < 3; i++) {
      const testTag = sdk.getReferralTag({
        user: testUser as `0x${string}`,
        consumer: DIVVI_CONSUMER_ADDRESS as `0x${string}`,
      });
      tags.push(testTag);
    }

    const allTagsIdentical = tags.every(t => t === tags[0]);
    log('tag_consistency', allTagsIdentical ? 'success' : 'warning', {
      tags,
      all_identical: allTagsIdentical,
    }, allTagsIdentical ? 'Tags are consistent' : 'Tags vary between calls');

    // Step 11: Test with different user addresses
    const testUsers = [
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      '0x1111111111111111111111111111111111111111',
      '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
    ];

    const multiUserTags = testUsers.map(user => {
      try {
        const userTag = sdk.getReferralTag({
          user: user as `0x${string}`,
          consumer: DIVVI_CONSUMER_ADDRESS as `0x${string}`,
        });
        return {
          user,
          tag: userTag,
          length: strip0x(userTag).length / 2,
          valid: isHex(userTag) && strip0x(userTag).length % 2 === 0,
        };
      } catch (error) {
        return {
          user,
          error: (error as Error)?.message,
        };
      }
    });

    log('multi_user_test', 'success', { tags: multiUserTags }, 'Multiple user tag generation test');

    // Step 12: Test our actual wrapper function (appendDivviTagToCalldataAsync)
    log('wrapper_test_start', 'success', {}, 'Testing appendDivviTagToCalldataAsync wrapper');

    try {
      // Import our wrapper function
      const { appendDivviTagToCalldataAsync } = await import('../_shared/divvi.ts');

      const sampleCalldata = '0x1234567890abcdef';
      const taggedResult = await appendDivviTagToCalldataAsync({
        data: sampleCalldata,
        user: testUser as `0x${string}`,
      });

      const wasTagged = taggedResult !== sampleCalldata;
      const tagLengthAdded = taggedResult ? taggedResult.length - sampleCalldata.length : 0;

      log('wrapper_test', wasTagged ? 'success' : 'error', {
        original_calldata: sampleCalldata,
        tagged_calldata: taggedResult,
        was_tagged: wasTagged,
        tag_length_added: tagLengthAdded,
        tag_added_bytes: tagLengthAdded / 2,
      }, wasTagged
        ? `✅ Wrapper successfully appended ${tagLengthAdded / 2} bytes to calldata`
        : '❌ Wrapper failed to append tag - fix did not work!'
      );

      if (!wasTagged) {
        log('wrapper_diagnosis', 'error', {},
          'The fix is not working. Tag is still being rejected by validation logic.');
      }
    } catch (error) {
      log('wrapper_test', 'error', {
        error_message: (error as Error)?.message,
        error_stack: (error as Error)?.stack,
      }, 'Failed to test wrapper function');
    }

    // Final summary
    const hasErrors = results.some(r => r.status === 'error');
    const hasWarnings = results.some(r => r.status === 'warning');

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        summary: {
          total_steps: results.length,
          errors: results.filter(r => r.status === 'error').length,
          warnings: results.filter(r => r.status === 'warning').length,
          sdk_source: sdkSource,
          tag_valid: encodedLength <= tagBytes,
        },
        diagnosis: {
          sdk_loading: sdkFromNpm ? 'npm' : (sdkFromEsm ? 'esm.sh' : 'failed'),
          tag_generation: hasGetReferralTag ? 'available' : 'missing',
          tag_validation: encodedLength <= tagBytes ? 'valid' : 'INVALID - length mismatch',
          recommendation: encodedLength > tagBytes
            ? 'SDK is generating malformed tags. This is the root cause of the error.'
            : 'SDK appears to be working correctly. Issue may be elsewhere.',
        },
        results,
      }, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    log('fatal_error', 'error', {
      error_message: (error as Error)?.message,
      error_name: (error as Error)?.name,
      error_stack: (error as Error)?.stack,
    }, 'Fatal error during debug test');

    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error)?.message || 'Unknown error',
        results,
      }, null, 2),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
