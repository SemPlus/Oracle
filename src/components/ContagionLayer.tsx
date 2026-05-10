import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useMap } from 'react-leaflet';
import { PulseData } from '../services/agentOrchestrator';

interface ContagionLayerProps {
  selectedPulse: PulseData;
}

const ASSET_HUBS: Record<string, { lat: number; lng: number; color: string }> = {
  'SPX': { lat: 40.71, lng: -74.01, color: '#eab308' },
  'NDX': { lat: 34.05, lng: -118.24, color: '#eab308' },
  'XBT': { lat: 35.67, lng: 139.65, color: '#f59e0b' },
  'XAU': { lat: 51.51, lng: -0.13, color: '#fbbf24' },
  'CL1': { lat: 26.28, lng: 50.21, color: '#f97316' },
};

export function ContagionLayer({ selectedPulse }: ContagionLayerProps) {
  const map = useMap();
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!map) return;

    // 1. Setup SVG Layer on Leaflet
    const svgLayer = (d3.select(map.getPanes().overlayPane).append('svg') as any)
      .attr('class', 'leaflet-zoom-animated contagion-layer')
      .style('pointer-events', 'none');
    
    const g = svgLayer.append('g').attr('class', 'leaflet-zoom-hide');
    svgRef.current = svgLayer.node() as SVGSVGElement;

    function update() {
      if (!svgRef.current) return;

      // Reset and resize SVG to map container
      const bounds = map.getBounds();
      const topLeft = map.latLngToLayerPoint(bounds.getNorthWest());
      const bottomRight = map.latLngToLayerPoint(bounds.getSouthEast());

      svgLayer
        .attr('width', bottomRight.x - topLeft.x)
        .attr('height', bottomRight.y - topLeft.y)
        .style('left', topLeft.x + 'px')
        .style('top', topLeft.y + 'px');

      g.attr('transform', `translate(${-topLeft.x}, ${-topLeft.y})`);

      g.selectAll('*').remove();

      // Draw Flow Lines
      const validHotspots = selectedPulse.hotspots.filter(h => 
        h.lat !== undefined && h.lng !== undefined && h.lat !== null && h.lng !== null
      );

      validHotspots.forEach((hotspot, hIdx) => {
        const sourcePos = map.latLngToLayerPoint([hotspot.lat, hotspot.lng]);
        
        // Find matching assets
        const matchedAssets = selectedPulse.marketCorrelations
          .filter(m => m.driver.toLowerCase().includes(hotspot.sector?.toLowerCase() || ''))
          .map(m => {
            if (m.assetClass.includes('S&P') || m.assetClass.includes('SPX')) return 'SPX';
            if (m.assetClass.includes('Nasdaq') || m.assetClass.includes('NDX')) return 'NDX';
            if (m.assetClass.includes('Crypto') || m.assetClass.includes('BTC')) return 'XBT';
            if (m.assetClass.includes('Gold') || m.assetClass.includes('XAU')) return 'XAU';
            if (m.assetClass.includes('Oil') || m.assetClass.includes('Crude')) return 'CL1';
            return null;
          })
          .filter(Boolean);

        const targetKeys = matchedAssets.length > 0 ? (matchedAssets as string[]) : ['SPX', 'CL1'];

        targetKeys.forEach((key, kIdx) => {
          const hub = ASSET_HUBS[key];
          if (!hub) return;
          const targetPos = map.latLngToLayerPoint([hub.lat, hub.lng]);

          // Quadratic Bezier
          const dx = targetPos.x - sourcePos.x;
          const dy = targetPos.y - sourcePos.y;
          const dr = Math.sqrt(dx * dx + dy * dy);
          
          const offsetX = -dy * 0.15;
          const offsetY = dx * 0.15;
          const cp = {
            x: (sourcePos.x + targetPos.x) / 2 + offsetX,
            y: (sourcePos.y + targetPos.y) / 2 + offsetY
          };

          const pathData = `M${sourcePos.x},${sourcePos.y} Q${cp.x},${cp.y} ${targetPos.x},${targetPos.y}`;

          // Ghost Line
          g.append('path')
            .attr('d', pathData)
            .attr('fill', 'none')
            .attr('stroke', hub.color)
            .attr('stroke-width', 1)
            .attr('opacity', 0.15)
            .attr('stroke-dasharray', '4,4');

          // Animated Contagion
          const animatedPath = g.append('path')
            .attr('d', pathData)
            .attr('fill', 'none')
            .attr('stroke', hub.color)
            .attr('stroke-width', 2)
            .attr('opacity', 0.8)
            .attr('class', 'contagion-arc');

          const totalLength = animatedPath.node()!.getTotalLength();
          animatedPath
            .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .delay(200 + hIdx * 300)
            .duration(1500)
            .ease(d3.easeCubicInOut)
            .attr('stroke-dashoffset', 0);

          // Kinetic Particle
          const particle = g.append('circle')
            .attr('r', 2)
            .attr('fill', '#fff')
            .attr('stroke', hub.color)
            .attr('stroke-width', 1)
            .attr('filter', 'drop-shadow(0 0 3px ' + hub.color + ')');

          function animateParticle() {
            particle
              .transition()
              .delay(Math.random() * 2000 + 1000)
              .duration(2000 + Math.random() * 1500)
              .ease(d3.easeLinear)
              .attrTween('transform', () => {
                return (t: number) => {
                  const p = (animatedPath.node() as SVGPathElement).getPointAtLength(t * totalLength);
                  return `translate(${p.x},${p.y})`;
                };
              })
              .on('end', animateParticle);
          }
          animateParticle();
        });
      });
    }

    map.on('viewreset', update);
    map.on('zoom', update);
    map.on('move', update);
    update();

    return () => {
      map.off('viewreset', update);
      map.off('zoom', update);
      map.off('move', update);
      svgLayer.remove();
    };
  }, [map, selectedPulse]);

  return null;
}
