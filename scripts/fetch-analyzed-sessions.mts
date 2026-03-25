import { serverDB } from '@/database/server';
import { voiceCallSessions } from '@lobechat/database/schemas';
import { desc, isNotNull } from 'drizzle-orm';

async function run() {
  console.log('Fetching recent voice call sessions with analysis results...');
  try {
    const rows = await serverDB
      .select({
        id: voiceCallSessions.id,
        createdAt: voiceCallSessions.createdAt,
        score: voiceCallSessions.score,
        analysisResult: voiceCallSessions.analysisResult,
        transcriptLength: voiceCallSessions.transcript,
      })
      .from(voiceCallSessions)
      .where(isNotNull(voiceCallSessions.analysisResult))
      .orderBy(desc(voiceCallSessions.createdAt))
      .limit(3);

    if (rows.length === 0) {
      console.log('No sessions with analysis results found in the database.');
    }

    for (const row of rows) {
      console.log(`\n=== Session: ${row.id} ===`);
      console.log(`Created At: ${row.createdAt}`);
      console.log(`Live Score: ${row.score}`);
      
      const transcript = Array.isArray(row.transcriptLength) ? row.transcriptLength : [];
      console.log(`Transcript lines: ${transcript.length}`);

      const analysis = row.analysisResult as any;
      if (analysis) {
        console.log(`Analyzed Overall Score: ${analysis.overallScore}`);
        console.log(`Summary: ${analysis.summary}`);
        console.log(`Strengths: ${analysis.strengths?.join(' | ')}`);
        console.log(`Improvements: ${analysis.improvements?.join(' | ')}`);
        
        if (analysis.phraseFeedback && analysis.phraseFeedback.length > 0) {
          console.log('\nFeedback sample:');
          const sample = analysis.phraseFeedback[0];
          console.log(`  User said: "${sample.userPhrase}"`);
          console.log(`  Suggested: "${sample.suggestedPhrase}"`);
          console.log(`  Advice: ${sample.advice}`);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching from DB:', err);
  }
}

run();