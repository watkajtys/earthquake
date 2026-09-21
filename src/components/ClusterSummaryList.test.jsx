import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClusterSummaryList from './ClusterSummaryList.jsx';
import ClusterSummaryItem from './ClusterSummaryItem.jsx';

const summaries = count => Array.from({ length: count }, (_, index) => ({ id: `cluster-${index}`, slug: `stored-${index}`,
  locationName: `Stored location ${index}`, quakeCount: 158, maxMagnitude: 6,
  timeRange: { prefix: 'Active over ', value: '30 days', suffix: '' } }));

describe('bounded cluster cards', () => {
  it('reduces a 1200-card fixture to 20 initial cards while preserving the total and selection identity', () => {
    const clusters = summaries(1200);
    const before = render(<ul>{clusters.map(cluster => <ClusterSummaryItem key={cluster.id} clusterData={cluster} />)}</ul>);
    const beforeNodes = before.container.querySelectorAll('*').length;
    expect(before.container.querySelectorAll('li')).toHaveLength(1200);
    before.unmount();
    const onClusterSelect = vi.fn();
    const after = render(<ClusterSummaryList clusters={clusters} onClusterSelect={onClusterSelect} />);
    const afterNodes = after.container.querySelectorAll('*').length;
    expect(within(screen.getByRole('list', { name: 'Active earthquake clusters' })).getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–20 of 1200 clusters');
    expect(afterNodes).toBeLessThan(beforeNodes / 20);
    fireEvent.click(screen.getByRole('button', { name: /Stored location 0 / }));
    expect(onClusterSelect).toHaveBeenCalledWith(clusters[0]);
    console.info(`Cluster DOM fixture: 1200→20 cards; ${beforeNodes}→${afterNodes} elements.`);
  });
  it('pages through remaining cards, keeps focus on its control and clamps after a smaller refresh', () => {
    const { rerender } = render(<ClusterSummaryList clusters={summaries(45)} />);
    const next = screen.getByRole('button', { name: 'Next clusters' });
    next.focus();
    fireEvent.click(next);
    expect(next).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 21–40 of 45 clusters');
    fireEvent.click(next);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 41–45 of 45 clusters');
    expect(next).toBeDisabled();
    rerender(<ClusterSummaryList clusters={summaries(22)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 21–22 of 22 clusters');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Previous clusters' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    screen.getByRole('button', { name: 'Next clusters' }).focus();
    rerender(<ClusterSummaryList clusters={summaries(5)} />);
    expect(screen.getByRole('list', { name: 'Active earthquake clusters' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–5 of 5 clusters');
    rerender(<ClusterSummaryList clusters={[]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
