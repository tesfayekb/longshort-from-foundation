import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import { Activity } from 'lucide-react';

/**
 * TradingDashboard — placeholder home page for the trading panel.
 *
 * At Step 4 there are no strategies enabled. This page renders an empty-state
 * card directing users to wait for strategy module activation. When strategies
 * are added via FP-005+ (long-short first), this page can be extended with
 * strategy summary cards, or the route can be redirected to the user's first
 * enabled strategy.
 */
export default function TradingDashboard() {
    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Trading</h1>
                <p className="text-muted-foreground">
                    Trading strategies and positions.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        No strategies enabled
                    </CardTitle>
                    <CardDescription>
                        No trading strategies are currently active for your
                        account. Strategy modules will appear here as they are
                        enabled.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Contact your administrator if you need access to a
                        specific strategy.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
