/**
 * GitHub Actions Script: Track Submission
 * 
 * Parses commit messages and sends submission data to Supabase Edge Function.
 * 
 * Environment variables required:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Supabase service role key
 * - COMMIT_MESSAGE: The commit message to parse
 * - REPOSITORY: GitHub repository (owner/repo)
 * - BRANCH: Git branch name
 * - COMMIT_HASH: Git commit SHA
 */

const VALID_TYPES = ['assignment', 'project', 'portfolio', 'notebook', 'code', 'research', 'publication'];
const VALID_STATUSES = ['planned', 'in-progress', 'completed', 'published'];

/**
 * Generates a GitHub commit URL from repository and commit hash
 */
function generateCommitUrl(repository, commitHash) {
  return `https://github.com/${repository}/commit/${commitHash}`;
}

/**
 * Parses a commit message and extracts submission metadata
 */
function parseCommitMessage(message, context) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const lines = message.trim().split('\n');
  const firstLine = lines[0].trim();

  // Parse [type] from the beginning
  const typeMatch = firstLine.match(/^\[([^\]]+)\]/);
  if (!typeMatch) {
    return null;
  }

  const type = typeMatch[1].toLowerCase();
  if (!VALID_TYPES.includes(type)) {
    return null;
  }

  // Extract the rest of the first line after [type]
  const afterType = firstLine.slice(typeMatch[0].length).trim();
  if (!afterType) {
    return null;
  }

  // Extract metadata tags (year:N phase:P week:W status:S)
  const yearMatch = afterType.match(/\byear:(\d+)\b/);
  const phaseMatch = afterType.match(/\bphase:(\S+)\b/);
  const weekMatch = afterType.match(/\bweek:(\S+)\b/);
  const statusMatch = afterType.match(/\bstatus:(\S+)\b/);

  // year, phase, and week are required
  if (!yearMatch || !phaseMatch || !weekMatch) {
    return null;
  }

  const year = parseInt(yearMatch[1], 10);
  const phase = phaseMatch[1];
  const week = weekMatch[1];

  // Status defaults to 'in-progress' if not specified
  let status = 'in-progress';
  if (statusMatch) {
    const parsedStatus = statusMatch[1].toLowerCase();
    if (VALID_STATUSES.includes(parsedStatus)) {
      status = parsedStatus;
    }
  }

  // Extract title (everything between [type] and the first metadata tag)
  const metadataPattern = /\b(year|phase|week|status):\S+/g;
  let titleEndIndex = afterType.length;
  let match;
  while ((match = metadataPattern.exec(afterType)) !== null) {
    if (match.index < titleEndIndex) {
      titleEndIndex = match.index;
    }
  }

  const title = afterType.slice(0, titleEndIndex).trim();
  if (!title) {
    return null;
  }

  // Extract description from subsequent lines
  const description = lines.slice(1).join('\n').trim();

  // Generate GitHub URL
  const githubUrl = generateCommitUrl(context.repository, context.commitHash);

  return {
    type,
    title,
    description,
    year,
    phase,
    week,
    status,
    repository: context.repository,
    branch: context.branch,
    commitHash: context.commitHash,
    githubUrl,
  };
}

/**
 * Sends submission data to Supabase Edge Function
 */
async function submitToSupabase(submission, supabaseUrl, serviceKey) {
  const url = `${supabaseUrl}/functions/v1/submit`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      type: submission.type,
      title: submission.title,
      description: submission.description || undefined,
      year: submission.year,
      phase: submission.phase,
      week: submission.week,
      status: submission.status,
      repository: submission.repository,
      branch: submission.branch,
      commitHash: submission.commitHash,
      githubUrl: submission.githubUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Main execution
 */
async function main() {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    COMMIT_MESSAGE,
    REPOSITORY,
    BRANCH,
    COMMIT_HASH,
  } = process.env;

  // Validate environment variables
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log('⚠️ Missing Supabase credentials. Skipping submission tracking.');
    console.log('   Set SUPABASE_URL and SUPABASE_SERVICE_KEY secrets in your repository.');
    process.exit(0);
  }

  if (!COMMIT_MESSAGE) {
    console.log('⚠️ No commit message found. Skipping submission tracking.');
    process.exit(0);
  }

  const context = {
    repository: REPOSITORY,
    branch: BRANCH,
    commitHash: COMMIT_HASH,
  };

  console.log('📝 Parsing commit message...');
  console.log(`   Repository: ${REPOSITORY}`);
  console.log(`   Branch: ${BRANCH}`);
  console.log(`   Commit: ${COMMIT_HASH.substring(0, 7)}`);

  const parsed = parseCommitMessage(COMMIT_MESSAGE, context);

  if (!parsed) {
    console.log('⚠️ Commit message does not follow submission format. Skipping.');
    console.log('   Expected format: [type] title year:N phase:P week:W status:S');
    console.log(`   Received: ${COMMIT_MESSAGE.split('\n')[0]}`);
    process.exit(0);
  }

  console.log('✅ Parsed submission:');
  console.log(`   Type: ${parsed.type}`);
  console.log(`   Title: ${parsed.title}`);
  console.log(`   Year: ${parsed.year}, Phase: ${parsed.phase}, Week: ${parsed.week}`);
  console.log(`   Status: ${parsed.status}`);

  try {
    console.log('📤 Submitting to Supabase...');
    const result = await submitToSupabase(parsed, SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    console.log('✅ Submission tracked successfully!');
    if (result.submission) {
      console.log(`   ID: ${result.submission.id}`);
    }
  } catch (error) {
    console.error('❌ Failed to submit:', error.message);
    process.exit(1);
  }
}

main();
