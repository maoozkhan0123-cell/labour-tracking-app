import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { eventId } = req.query;

    if (!eventId) {
        return res.status(400).json({ error: 'Missing eventId query parameter' });
    }

    try {
        // Initialize Supabase Client
        // Note: In Vercel/Node environment, we use process.env
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch MO Details
        const { data: moData, error: moError } = await supabase
            .from('manufacturing_orders')
            .select('*')
            .eq('event_id', eventId)
            .single();

        if (moError) {
            return res.status(404).json({ error: 'Manufacturing Order not found', details: moError.message });
        }

        const mo = moData;

        // 2. Fetch Tasks linked to this MO
        const { data: tasksData, error: taskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('mo_reference', mo.mo_number)
            .order('created_at', { ascending: false });

        if (taskError) {
            throw new Error('Error fetching tasks: ' + taskError.message);
        }

        const tasks = tasksData;

        // 3. Fetch Users for Hourly Rates
        const { data: usersData, error: userError } = await supabase
            .from('users')
            .select('id, name, hourly_rate')
            .eq('role', 'employee');

        if (userError) {
            throw new Error('Error fetching users: ' + userError.message);
        }

        const userMap = new Map();
        usersData.forEach(u => {
            userMap.set(u.id, { name: u.name, rate: u.hourly_rate || 0 });
        });

        // 4. Aggregate Metrics
        let totalSeconds = 0;
        let totalCost = 0;
        const logs = [];

        tasks.forEach(task => {
            const worker = userMap.get(task.assigned_to_id) || { name: 'Unknown', rate: 0 };

            // Calculate Duration
            let durationSec = task.active_seconds || 0;
            // If active and we want real-time projection, we could calculate diff, 
            // but for a backend report, stored active_seconds constitutes "logged" time.
            // (Optionally add real-time skew if needed, but sticking to stored data is safer for consistent reports)

            const hours = durationSec / 3600;
            const cost = hours * worker.rate;

            totalSeconds += durationSec;
            totalCost += cost;

            // Format Duration HH:MM:SS
            const h = Math.floor(durationSec / 3600);
            const m = Math.floor((durationSec % 3600) / 60);
            const s = durationSec % 60;
            const formattedTime = [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");

            logs.push({
                worker_name: worker.name,
                description: task.description, // Operation
                duration: formattedTime,
                duration_minutes: Math.round(durationSec / 60),
                cost: parseFloat(cost.toFixed(2)),
                timestamp: task.created_at,
                status: task.status
            });
        });

        // Final Metrics
        const totalH = Math.floor(totalSeconds / 3600);
        const totalM = Math.floor((totalSeconds % 3600) / 60);
        const totalS = totalSeconds % 60;

        const responsePayload = {
            mo_details: mo,
            metrics: {
                total_time_seconds: totalSeconds,
                total_time_formatted: [totalH, totalM, totalS].map(v => v < 10 ? "0" + v : v).join(":"),
                total_cost: parseFloat(totalCost.toFixed(2)),
                current_status: mo.current_status
            },
            logs: logs
        };

        res.status(200).json(responsePayload);

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
