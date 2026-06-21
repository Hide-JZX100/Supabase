/**
 * @file 11_Config.設定管理.gs
 * @description TriggerHandoffLab_Receiver の設定・定数管理モジュール。
 * 現時点では設定項目は少ないが、将来の拡張（受信内容に応じた分岐処理等）に備えて分離する。
 *
 * @version 1.0
 */

// このLabでは固定の認証は設けない（学習目的のため）。
// 本番適用時は、受信側の doPost(e) でトークン等による簡易認証を検討すること。
