
import React from 'react';
import { CallStatus } from '../types';
import { STATUS_STYLES } from '../constants';

interface StatusBadgeProps {
  status: CallStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const style = STATUS_STYLES[status] || { bg: 'bg-gray-100', text: 'text-gray-800', ring: 'ring-gray-600/20' };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
