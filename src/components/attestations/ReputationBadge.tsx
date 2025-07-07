import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Award, Star, AlertTriangle } from 'lucide-react';

interface ReputationBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const ReputationBadge: React.FC<ReputationBadgeProps> = ({
  score,
  size = 'md',
  showIcon = true
}) => {
  const getReputationTier = (score: number) => {
    if (score >= 200) return { tier: 'Legendary', color: 'bg-purple-500', icon: Award };
    if (score >= 150) return { tier: 'Expert', color: 'bg-blue-500', icon: Star };
    if (score >= 100) return { tier: 'Trusted', color: 'bg-green-500', icon: Award };
    if (score >= 50) return { tier: 'Active', color: 'bg-yellow-500', icon: Star };
    return { tier: 'New', color: 'bg-gray-500', icon: AlertTriangle };
  };

  const { tier, color, icon: Icon } = getReputationTier(score);
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <Badge 
      className={`${color} text-white ${sizeClasses[size]} flex items-center space-x-1`}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{score} • {tier}</span>
    </Badge>
  );
};