"use strict";

const MAX_RISK_PERCENT=2;
const MIN_RR=2;

function finite(v){return Number.isFinite(Number(v));}
function validateRisk({balance,riskPercent,entry,stop,target,contractSize=100,dailyLoss=0,dailyLossLimit=20}){
  balance=Number(balance);riskPercent=Number(riskPercent);entry=Number(entry);stop=Number(stop);target=Number(target);contractSize=Number(contractSize);dailyLoss=Number(dailyLoss)||0;dailyLossLimit=Number(dailyLossLimit);
  const errors=[];
  if(![balance,riskPercent,entry,stop,target,contractSize].every(Number.isFinite))errors.push("All risk inputs must be valid numbers.");
  if(balance<=0)errors.push("Account balance must be positive.");
  if(riskPercent<=0||riskPercent>MAX_RISK_PERCENT)errors.push(`Risk must be greater than 0% and no more than ${MAX_RISK_PERCENT}%.`);
  if(contractSize<=0)errors.push("Contract size must be positive.");
  const distance=Math.abs(entry-stop),reward=Math.abs(target-entry);
  if(distance<=0)errors.push("Stop-loss must be different from entry.");
  if(reward<=0)errors.push("Target must be different from entry.");
  const side=entry>stop&&target>entry?"BUY":entry<stop&&target<entry?"SELL":null;
  if(!side)errors.push("Entry, stop-loss and target do not form a valid BUY or SELL structure.");
  const rr=distance>0?reward/distance:0;
  if(rr<MIN_RR)errors.push(`Minimum risk/reward is 1:${MIN_RR}.`);
  const riskAmount=balance*riskPercent/100;
  const dailyRemaining=Number.isFinite(dailyLossLimit)?Math.max(0,dailyLossLimit+Math.min(0,dailyLoss)):dailyLossLimit;
  if(Number.isFinite(dailyLossLimit)&&dailyLoss<=-dailyLossLimit)errors.push("Daily loss limit has been reached.");
  if(Number.isFinite(dailyLossLimit)&&riskAmount>dailyRemaining&&dailyRemaining>=0)errors.push("This trade risks more than the remaining daily loss allowance.");
  const lots=errors.length?0:riskAmount/(distance*contractSize);
  return {valid:errors.length===0,side,errors,balance,riskPercent,riskAmount,stopDistance:distance,rewardDistance:reward,rr:Number(rr.toFixed(2)),lots:Number(lots.toFixed(4)),units:Number((lots*contractSize).toFixed(2)),maxRiskPercent:MAX_RISK_PERCENT,minRR:MIN_RR,dailyRemaining};
}

module.exports={MAX_RISK_PERCENT,MIN_RR,validateRisk};
